# Environment Variables

All variables live in `apps/api/.env` (backend) and `apps/web/.env` (frontend).
Copy the respective `.env.example` files to `.env` and fill in the values.

---

## apps/api

| Variable | Required | Example | Notes |
|---|---|---|---|
| `PORT` | no | `3001` | Defaults to 3001 |
| `NODE_ENV` | yes | `development` | `development` / `production` |
| `DATABASE_URL` | yes | `postgresql://user:pass@host:5432/hoard` | Supabase connection string |
| `JWT_SECRET` | yes | (random 32+ chars) | Used to sign HTTP-only JWTs |
| `JWT_EXPIRES_IN` | no | `7d` | Defaults to 7d |
| `WEB_URL` | yes | `http://localhost:5173` | Allowed CORS origin |
| `API_URL` | yes (prod) | `https://api.gamehoardr.com` | Public origin of the API. Used as Steam OpenID `return_to` + `realm`, and as the fallback for `GOOGLE_REDIRECT_URI`. Defaults to `http://localhost:3001` for dev. **Without this set in production, Steam OpenID redirects users back to `localhost:3001` after sign-in (broken).** |
| `GOOGLE_CLIENT_ID` | Phase 4 | — | Google OAuth 2.0 app client ID |
| `GOOGLE_CLIENT_SECRET` | Phase 4 | — | Google OAuth 2.0 app client secret |
| `GOOGLE_REDIRECT_URI` | Phase 4 | `http://localhost:3001/api/auth/google/callback` | Must match Google console |
| `STEAM_API_KEY` | Phase 4 | — | From steamcommunity.com/dev/apikey |
| `TWITCH_CLIENT_ID` | Phase 5 | — | From dev.twitch.tv (for IGDB) |
| `TWITCH_CLIENT_SECRET` | Phase 5 | — | From dev.twitch.tv (for IGDB) |
| `OPENXBL_API_KEY` | Phase 4 | — | From xbl.io — validate free tier covers full library |
| `GOG_CLIENT_ID` | Phase 4 | — | GOG community OAuth |
| `GOG_CLIENT_SECRET` | Phase 4 | — | GOG community OAuth |
| `NPM_CONFIG_PRODUCTION` | Railway only | `false` | **Required on Railway.** Forces `npm ci` to install `devDependencies` so the build finds `typescript` and `@types/*`. Without it, `tsc -b` fails with `Cannot find name 'process'`. |

---

## apps/web

| Variable | Required | Example | Notes |
|---|---|---|---|
| `VITE_API_URL` | no | `http://localhost:3001` | Backend base URL — must be prefixed with `VITE_` |

---

## Notes

- **Never commit `.env` files.** They are in `.gitignore`.
- **PSN (NPSSO token)** is entered by the user in the Settings UI at runtime — it is stored encrypted in the database, not as an env var.
- **Railway** injects `DATABASE_URL`, `PORT`, and custom vars from the Railway dashboard at deploy time.
- **Vercel** injects `VITE_API_URL` from the Vercel dashboard for preview and production environments.
- **IGDB tokens** are fetched and cached server-side using `TWITCH_CLIENT_ID` + `TWITCH_CLIENT_SECRET`. No user-facing token.
