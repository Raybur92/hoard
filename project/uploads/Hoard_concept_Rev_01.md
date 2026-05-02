# Hoard — Concept Brief

## What it is

Hoard is a personal game tracking web app. It connects to your gaming accounts, pulls in your libraries automatically, and gives you one place to see everything you own, everything you're playing, and everything you're waiting for.

The name is intentional. A hoard is a collection that got out of hand — and that's the point. Hoard doesn't judge the backlog. It celebrates it.

---

## The problem it solves

If you game across multiple platforms — Steam, PlayStation, Xbox, GOG — your library is fragmented. You don't know what you own where. You forget what you were playing. You lose track of what's coming out. You manually maintain lists that go stale.

Hoard fixes this by syncing automatically from your connected accounts. You link your platforms once, and Hoard takes care of the rest.

---

## Core features

### Platform sync
Connect Steam, PSN, Xbox, and GOG accounts. Hoard fetches your library, playtime, and achievements automatically and keeps them in sync. No manual imports. No CSV uploads.

### Unified library
Every game you own, across every platform, in one view. Filterable and sortable by status, platform, genre, playtime, and more.

### Game statuses
- **Playing** — currently active
- **Backlog** — owned, not started
- **Completed** — finished
- **On Hold** — paused
- **Dropped** — abandoned
- **Wishlist** — don't own yet, want it

### Upcoming releases
An IGDB-powered feed of upcoming games, filterable by platform and genre. Add anything directly to your wishlist. See countdowns for games you're already tracking.

### Game detail
Everything about a game in one place — metadata from IGDB, your playtime across platforms, your status, your notes, and how long it takes to beat. Designed to feel like a collector's record, not a database row.

The detail view includes a dedicated **How Long to Beat** block sourced from HowLongToBeat.com (via the `howlongtobeat` npm package — unofficial but widely used). It shows three figures side by side: Main Story, Main + Extras, and Completionist. Your own logged playtime sits alongside these as a fourth column, so you can see at a glance where you are relative to each target.

A compact HLTB snippet — just the main story estimate — also appears on backlog items in the library view, and on the dashboard's backlog picker if that feature is present. The goal is to make time-to-beat visible at the moments it actually influences a decision: when choosing what to start next.

### Dashboard
Your personal command center. Active sessions, stats at a glance, and a countdown of wishlisted games that are dropping soon.

---

## Platform integrations

| Platform | Method |
|---|---|
| Steam | OpenID OAuth + Steam Web API |
| PlayStation Network | NPSSO token + psn-api |
| Xbox | OpenXBL API |
| GOG | Community-documented OAuth + API |
| Game metadata | IGDB (Twitch API) |
| How Long to Beat | howlongtobeat npm package (unofficial scraper) |

Nintendo and Epic are not supported — neither has a viable public API for library access.

Note: the HowLongToBeat integration is community-maintained, not an official API. It works reliably but carries the same caveat as the PSN integration — it could break if the source site changes.

---

## Tech stack

- **Frontend** — React + TypeScript
- **Backend** — Node.js + Express
- **Database** — PostgreSQL via Supabase
- **ORM** — Prisma
- **Hosting** — Vercel (frontend) + Railway (backend)
- **Delivery** — PWA, installable on desktop and mobile

---

## Tone and personality

Hoard is a tool built by someone who actually games. It's not a polished SaaS product trying to appeal to everyone. It's dense, a little obsessive, and proud of it.

The visual language leans into collector culture — terminal aesthetics, data density, the feel of a well-worn inventory screen. The game detail view is designed to feel like something worth screenshotting. The dashboard feels like a control panel, not a wellness app.

It respects the user's intelligence. It shows the data. It doesn't hide numbers behind vague progress rings.

---

## What it is not

- Not a social network. There are no followers, no feeds, no public profiles.
- Not a recommendation engine. Hoard doesn't tell you what to play next (though it might surface a random pick from your backlog if you ask).
- Not a review platform. You can rate and note privately, but this isn't Letterboxd for games.
- Not a SaaS product (yet). This is a personal tool first.

---

## Screens

1. **Dashboard** — stats, active session, wishlist countdown
2. **Library** — full collection, filterable by status and platform
3. **Upcoming** — release feed from IGDB, tied to your wishlist
4. **Game detail** — per-game record, receipt-style

---

## Open questions (for later)

- Should there be a stats / wrapped view? (yearly summary, most played genre, etc.)
- Should the backlog picker ("tonight you might play…") be a permanent feature or an Easter egg?
- If Hoard ever opens to other users, what does onboarding look like?
