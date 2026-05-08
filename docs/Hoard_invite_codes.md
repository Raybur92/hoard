# Hoard — Invite Code System & Admin Panel

**Status:** Spec for v1 closed beta gating
**Owner:** Andrea
**Related docs:** `Hoard_concept.md`

---

## 1. Goals

Gate registration to Hoard behind single-use invite codes during the closed beta, and give the admin (Andrea) a single in-app place to generate codes, see who has signed up, and respond to access requests.

**Non-goals for v1:**
- Multi-admin support
- Code expiry
- Self-service onboarding (public signup)
- Email notifications when a code is redeemed or a request comes in

---

## 2. User-facing flow

There are two actors: **the friend** (a new user) and **the admin** (Andrea).

### 2.1 Friend's path

1. Friend lands on the Hoard login page and authenticates via one of the three existing paths: email/password registration, Google OAuth, or Steam OpenID.
2. Their `User` row is created as normal, but with `status: 'pending_invite'`. JWT is issued so they're technically signed in.
3. Frontend tries to load the dashboard, hits 403 with a specific error code (`PENDING_INVITE`), and instead renders the **Welcome screen** (see §4 for copy).
4. The welcome screen offers two paths:
   - **"I have an invite code"** — opens an input field. On submit, code is validated and redeemed; status flips to `active`; user lands on the dashboard.
   - **"Request access"** — opens a small textarea ("Tell Andrea who you are, optional"). On submit, `hasRequestedAccess` is set to true and the message is stored. Screen confirms "Request sent — Andrea will get back to you." User remains on the screen.
5. A sign-out button is always visible on this screen.
6. If the user closes the tab and comes back later, they re-authenticate, hit the same 403, and land back on the welcome screen — with their previous request status reflected (e.g. "You've requested access — waiting on Andrea").

### 2.2 Admin's path

1. Andrea navigates to `/admin` (gated by `ADMIN_USER_ID` env var matching her user ID).
2. Sees three sections: **Users**, **Invite codes**, and a **Generate code** button at the top.
3. To onboard a friend who has already signed up and requested access: clicks Generate code, optionally adds a note ("for Marco"), copies the resulting code, sends it to Marco out-of-band (iMessage, WhatsApp, etc.).
4. To pre-onboard a friend who hasn't signed up yet: same flow — generate code, send it. Friend signs in later and redeems.

---

## 3. Data model

### 3.1 New table: `InviteCode`

```prisma
model InviteCode {
  id        String    @id @default(cuid())
  code      String    @unique
  note      String?
  createdAt DateTime  @default(now())
  usedAt    DateTime?
  usedById  String?   @unique
  usedBy    User?     @relation(fields: [usedById], references: [id])
}
```

- `code` is the human-readable string shown to the user (format below).
- `note` is admin-only, free text, e.g. "for Marco" or "spare".
- `usedById` is `@unique` because each code can only be redeemed once and we want a 1:1 link from code to user.

### 3.2 Changes to `User`

```prisma
model User {
  // ... existing fields ...
  status                 UserStatus @default(PENDING_INVITE)
  hasRequestedAccess     Boolean    @default(false)
  accessRequestMessage   String?
  accessRequestedAt      DateTime?
  redeemedInviteCode     InviteCode?
}

enum UserStatus {
  PENDING_INVITE
  ACTIVE
}
```

- `status` controls whether the user can access the app.
- The three access-request fields are nullable/false by default and only set if the user clicks "Request access" on the welcome screen.

### 3.3 Migration

A single Prisma migration:

1. Creates the `InviteCode` table.
2. Adds the new columns to `User` with defaults.
3. **Critically**: backfills `status = 'ACTIVE'` for all existing users (Andrea, Luigi, the secondary test account). Without this step, the existing testers would be locked out the moment the migration runs.

```sql
-- Pseudocode for the data migration step
UPDATE "User" SET status = 'ACTIVE' WHERE "createdAt" < NOW();
```

In practice, since the closed beta hasn't started yet, "all users created before this migration" is the right backfill rule. After the migration, the default for new users becomes `PENDING_INVITE`.

---

## 4. Code format

`HOARD-XXXX-XXXX` where each `X` is a character from a reduced alphanumeric set:

- **Alphabet:** `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no `0`, `O`, `1`, `I` — avoids ambiguity when typed)
- **Length:** 8 characters of entropy, ~32^8 ≈ 1 trillion combinations. More than enough for a closed beta of <50 codes; collisions effectively impossible.
- **Example codes:** `HOARD-7K2M-PLAY`, `HOARD-XQ4N-9TBR`, `HOARD-MARC-O123`

The `HOARD-` prefix is fixed and serves as a recognizable signal in chat ("yeah here's your Hoard code").

**Generation:** server-side only, on the admin's request. Backend rejects any code submission that doesn't match the `^HOARD-[A-Z2-9]{4}-[A-Z2-9]{4}$` regex before even hitting the database.

---

## 5. Welcome screen copy

The screen has two states: **default** (just authenticated) and **request-sent** (already clicked Request access).

### 5.1 Default state

```
> WELCOME TO HOARD
> ───────────────────────────────────────
>
> Hoard is in closed beta. Access is invite-only.
>
> If you have a code, paste it below.
> If you don't, request access and Andrea will
> get in touch.
>
> [ I have a code ]   [ Request access ]
>
>                                    [sign out]
```

Clicking "I have a code" reveals an input field with the placeholder `HOARD-XXXX-XXXX` and a Submit button. Invalid codes show an error: `Code not recognized. Check for typos or ask Andrea for a new one.` Already-used codes show: `This code has already been redeemed.`

Clicking "Request access" reveals a textarea with the placeholder `Tell Andrea who you are (optional). e.g. "Hi, I'm Marco — Luigi told me about Hoard."` and a Send request button.

### 5.2 Request-sent state

```
> REQUEST SENT
> ───────────────────────────────────────
>
> Andrea has been notified. You'll get a code
> at the address you signed in with.
>
> Got a code in the meantime? Paste it below.
>
> [ HOARD-XXXX-XXXX ____________ ] [ Submit ]
>
>                                    [sign out]
```

This state persists across sessions — if the user signs out and back in, they still see this version, not the default.

---

## 6. Backend changes

### 6.1 Auth route changes (`apps/api/src/routes/auth.ts`)

All three account creation paths — `POST /api/auth/register`, the Google OAuth callback, and the Steam OpenID callback — set `status: 'PENDING_INVITE'` on new User rows. **Existing users are unaffected** because they're already migrated to `ACTIVE`.

### 6.2 New middleware: `requireActive`

Sits after the existing JWT auth middleware. If `req.user.status !== 'ACTIVE'`, returns 403 with body:

```json
{ "error": "PENDING_INVITE", "hasRequestedAccess": true }
```

The frontend keys off `error: "PENDING_INVITE"` to render the welcome screen, and uses `hasRequestedAccess` to pick which state.

This middleware is applied to **every** route except:
- `POST /api/auth/redeem-invite`
- `POST /api/auth/request-access`
- `POST /api/auth/logout`
- `GET /api/auth/me` (so the frontend can hydrate the welcome screen with current status)

### 6.3 New routes

**`POST /api/auth/redeem-invite`**
Body: `{ code: string }`
Validates format, looks up code, checks `usedById IS NULL`, in a transaction: sets `usedById = req.user.id`, `usedAt = NOW()`, sets `User.status = 'ACTIVE'`, links `User.redeemedInviteCode`. Returns the user object so the frontend can route to the dashboard.

**`POST /api/auth/request-access`**
Body: `{ message?: string }`
Sets `hasRequestedAccess = true`, `accessRequestMessage = message`, `accessRequestedAt = NOW()` on `req.user`. Idempotent — calling twice just updates the message and timestamp. Returns 200.

### 6.4 Admin routes (`apps/api/src/routes/admin.ts`, new file)

All gated by a new `requireAdmin` middleware: `req.user.id === process.env.ADMIN_USER_ID`. Returns 404 (not 403) if the check fails — no need to reveal that an admin route exists.

**`GET /api/admin/users`**
Returns all users with: `id`, `email`, `name`, `status`, `createdAt`, platform connection summary (count + which platforms), `hasRequestedAccess`, `accessRequestMessage`, `accessRequestedAt`, redeemed code if any. The response also includes a `displayIdentity` field that the admin UI surfaces as the row's primary label.

**`displayIdentity` fallback order (single source of truth in [apps/api/src/lib/displayIdentity.ts](../apps/api/src/lib/displayIdentity.ts)):**
1. **Real (non-synthetic) email** → `email`. Email-based and Google-linked accounts always show their email — that's the ground-truth identifier.
2. **Synthetic Steam email + `name` set** → `name`. The Steam OpenID callback populates `User.name` from `GetPlayerSummaries` (e.g. "Bedkarma"), which is the identifier the admin actually recognizes. Strictly preferred over the Steam64 ID.
3. **Synthetic Steam email + `name` null** → `"Steam user — {steamId}"`. Fallback path — fires when the Steam profile is private or `GetPlayerSummaries` failed during the OAuth callback.

**`GET /api/admin/invite-codes`**
Returns all invite codes with: `code`, `note`, `createdAt`, `usedAt`, `usedBy` (user summary if redeemed).

**`POST /api/admin/invite-codes`**
Body: `{ note?: string }`. Generates a new code (regenerating on the rare collision until unique). Returns the new code.

**`DELETE /api/admin/invite-codes/:id`**
Only allowed for unused codes (`usedById IS NULL`). Used codes can't be revoked because the user is already active.

---

## 7. Admin page (`/admin`)

A single-page admin view inside the existing app, reusing the terminal aesthetic.

### 7.1 Layout

```
> HOARD ADMIN                                    [refresh]
> ─────────────────────────────────────────────────────────
>
> [ + GENERATE CODE ]
>
> ─── PENDING ACCESS REQUESTS (2) ─────────────────────────
>
> marco@gmail.com                          requested 2h ago
>   "Hi, I'm Marco — Luigi told me about Hoard."
>   [ generate code for marco ]
>
> Steam user — 76561198012345678          requested 1d ago
>   (no message)
>   [ generate code ]
>
> ─── ALL USERS (5) ───────────────────────────────────────
>
> andrea@... ............ active     joined 2026-04-12  4 platforms
> luigi@... ............. active     joined 2026-05-06  2 platforms
> andrea-test@... ....... active     joined 2026-05-06  0 platforms
> marco@gmail.com ....... pending    joined 2026-05-07  1 platform
> Steam user — 7656... .. pending    joined 2026-05-07  1 platform
>
> ─── INVITE CODES ────────────────────────────────────────
>
> HOARD-7K2M-PLAY  for luigi      used by luigi@...     2026-05-06
> HOARD-XQ4N-9TBR  spare          unused                [revoke]
> HOARD-MARC-O123  for marco      unused                [revoke]
```

### 7.2 Generate code interaction

Clicking **Generate code** opens an inline prompt for an optional note, then on confirm hits `POST /api/admin/invite-codes` and shows the new code in a copyable callout:

```
> NEW CODE GENERATED
>
>   HOARD-7K2M-PLAY                              [copy]
>
> Send this to your friend. They'll paste it after
> signing in.
```

The "generate code for marco" button on a pending request is the same flow but pre-fills the note with the user's email/identity.

### 7.3 Gating

Frontend: `/admin` route checks `currentUser.id === ADMIN_USER_ID` (exposed safely via the `/api/auth/me` response — or the frontend just lets the backend do the gating and shows a 404 page if the API returns 404).

Backend: `requireAdmin` middleware on every `/api/admin/*` route.

---

## 8. Rollout checklist

In order:

1. **Write the migration** — new table, new columns, backfill existing users to `ACTIVE`. Test it locally against a dump of production data if possible (or against a fresh local DB seeded with 3 fake users mimicking the current state).
2. **Deploy backend changes** — auth routes set `PENDING_INVITE` on new users, `requireActive` middleware on protected routes, redeem/request endpoints, admin routes. **At this point, new signups would be locked out, but no-one is currently signing up except testers, so this is safe.**
3. **Deploy frontend changes** — welcome screen, admin page. Frontend handles `PENDING_INVITE` 403 responses.
4. **Generate first batch of codes** via the admin page — one for each friend you want to onboard (Marco, etc.). Verify the codes work end-to-end with one friend before sending the rest.
5. **Verify existing users are unaffected** — sign out and back in as Andrea, Luigi, secondary test account. All three should land on the dashboard, not the welcome screen.

---

## 9. Open items / v2 considerations

- **Email notifications** — when an access request comes in, currently Andrea has to check the admin panel to see it. A future improvement: a webhook or Resend integration that emails Andrea on new requests. Out of scope for v1.
- **Code expiry** — not implemented for v1; codes live forever until used. Easy to add later by adding `expiresAt` to `InviteCode` and a check in the redeem endpoint.
- **Bulk code generation** — for v1, generating one code at a time is fine. If beta scales beyond ~20 testers, add a "generate N codes" button.
- **Rejection of access requests** — currently no way to reject. The user just sits in `pending_invite` forever, which is functionally identical to silent rejection. Explicit rejection is an unnecessary surface area for v1.
- **Audit log** — who generated which code, when. Skipping for v1 since there's only one admin and the `InviteCode.createdAt` field is sufficient.
