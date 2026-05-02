# Hoard — Manual Integration Tests

Automated tests (Jest + Playwright) cover the unit and E2E layers. The scenarios below require real external accounts or cannot be driven by a headless runner. Run them before shipping a Phase 4 build.

---

## Steam OAuth — Full Login Flow

**When to run:** Before deploying any change to `apps/api/src/routes/auth.ts` or `apps/api/src/middleware/user.ts`.

**Prerequisites:**

- A real Steam account you control.
- `STEAM_API_KEY` set in `apps/api/.env` (get one at https://steamcommunity.com/dev/apikey — use `localhost` as the domain).
- `API_URL=http://localhost:3001` and `WEB_URL=http://localhost:5173` in `apps/api/.env`.
- Both dev servers running: `npm run dev`.

**Steps:**

1. Open `http://localhost:5173/login` in a browser. You should see the Login screen with "continue with steam" button.

2. Click **continue with steam**. The browser redirects to `http://localhost:3001/api/auth/steam`, which immediately redirects to `https://steamcommunity.com/openid/login?...`.

3. Sign in with your Steam credentials. Steam redirects back to `http://localhost:3001/api/auth/steam/callback?openid.mode=id_res&openid.claimed_id=https://steamcommunity.com/openid/id/<steam64id>&...`.

4. The callback handler:
   - POSTs to `https://steamcommunity.com/openid/login` with `openid.mode=check_authentication` to verify the assertion.
   - Extracts the Steam64 ID from `openid.claimed_id`.
   - Fetches the display name from `ISteamUser/GetPlayerSummaries` using `STEAM_API_KEY`.
   - Creates (or finds) a `User` row with `steamId` set.
   - Sets a `session` JWT cookie.
   - Redirects to `http://localhost:5173/` (the Dashboard).

**What to verify:**

| Check | Expected |
|---|---|
| Browser lands on the Dashboard (not `/login`) | ✓ |
| No `?error=steam_failed` in the URL at any point | ✓ |
| `GET http://localhost:3001/api/auth/me` (in browser devtools or curl with the cookie) returns `{ user: { steamId: "<your id>", name: "<your persona name>" } }` | ✓ |
| A row exists in `User` table with the correct `steamId` (check via `npx prisma studio`) | ✓ |
| Running the flow a second time (sign out, click Steam again) finds the existing user and does **not** create a duplicate row | ✓ |

**Failure modes to check manually:**

| Scenario | How to trigger | Expected behaviour |
|---|---|---|
| User cancels on Steam login page | Click "Cancel" on the Steam consent page | Redirected to `http://localhost:5173/login?error=steam_failed` |
| `STEAM_API_KEY` missing | Remove the key from `.env`, restart API | User is still created, display name falls back to `Steam:<steam64id>` |
| Steam OpenID verification returns `is_valid:false` | Not reliably reproducible manually — covered by unit test in `routes/auth.test.ts` | — |

**Cleanup:**

```bash
# Remove the test user so the next run tests fresh account creation
npx prisma studio   # delete the row from the User table manually
# or:
npx ts-node -e "const {prisma} = require('@hoard/db'); prisma.user.deleteMany({ where: { steamId: { not: null } } }).then(console.log)"
```

---

## Google OAuth — Full Login Flow

**When to run:** Same trigger as Steam.

**Prerequisites:**

- A Google account you control.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` set in `apps/api/.env`. OAuth credentials must have `http://localhost:3001/api/auth/google/callback` in the list of authorised redirect URIs (Google Cloud Console → APIs & Services → Credentials).
- `GOOGLE_REDIRECT_URI=http://localhost:3001/api/auth/google/callback` in `.env`.
- Both dev servers running.

**Steps:**

1. Open `http://localhost:5173/login`. Click **continue with google**.

2. The browser redirects to Google's consent screen. Sign in and grant access.

3. Google redirects to `http://localhost:3001/api/auth/google/callback?code=<auth_code>&...`.

4. The callback handler exchanges the code for tokens, fetches the Google userinfo, upserts the user, sets the session cookie, and redirects to `http://localhost:5173/`.

**What to verify:**

| Check | Expected |
|---|---|
| Browser lands on Dashboard | ✓ |
| `GET /api/auth/me` returns the user with correct `email` and `name` | ✓ |
| Running the flow a second time reuses the existing user row | ✓ |
| If the Google account email matches an existing email/password user, `googleId` is linked to that row (not a duplicate) | ✓ |

---

## PSN NPSSO — Token Retrieval and Connect

**When to run:** Before any change to `apps/api/src/routes/platforms.ts` PSN connect endpoint or `apps/web/src/components/screens/PsnGuidedFlow*.tsx`.

**Prerequisites:**

- A PlayStation Network account.
- Both dev servers running.

**Steps:**

1. Open `http://localhost:5173/settings/platforms/ps/connect` (the guided flow).

2. Follow the 5-step flow:
   - Step 1: Read instructions.
   - Step 2: Open the Sony sign-in link, authenticate.
   - Step 3: Open the NPSSO endpoint URL (`https://ca.account.sony.com/api/v1/ssocookie`). The browser shows `{"npsso":"<64-char-token>"}`.
   - Step 4: Copy the 64-character token, paste into the input field. The counter should show `64/64`.
   - Step 5: Click **save & connect**. Should advance to the success step.

**What to verify:**

| Check | Expected |
|---|---|
| Character counter reaches 64/64 | ✓ |
| Clicking save with fewer than 64 chars keeps the button disabled | ✓ |
| After save, step 5 shows "PSN connected!" | ✓ |
| `GET /api/platforms/status` returns a PS entry with `syncStatus: "ok"` | ✓ |
| Platform row in DB (`npx prisma studio`) has `credentials.npsso` set | ✓ |

---

## Notes

- These tests are run manually before any Phase 4 production deploy.
- Automated coverage for the callback handlers (with mocked HTTP) lives in `apps/api/src/routes/auth.test.ts`.
- Steam deduplication (two platforms → one UserGame) will be tested in Phase 5 alongside the IGDB sync runner.
