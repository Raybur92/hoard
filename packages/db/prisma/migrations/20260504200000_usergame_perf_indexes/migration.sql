-- Composite indexes to support the per-user, per-status / per-lastPlayedAt
-- query patterns hit by /api/games (filter + sort), /api/games/counts (groupBy),
-- /api/games/shelves (per-status take), and /api/upcoming wishlist countdown.
--
-- Without these the planner falls back to a sequential scan + filter on
-- UserGame for any (userId, status) or (userId, lastPlayedAt) query — fine at
-- a few hundred rows but worth getting right before the library grows.

CREATE INDEX "UserGame_userId_status_idx" ON "UserGame" ("userId", "status");

CREATE INDEX "UserGame_userId_lastPlayedAt_idx" ON "UserGame" ("userId", "lastPlayedAt" DESC);

CREATE INDEX "WishlistRelease_userId_releaseDate_idx" ON "WishlistRelease" ("userId", "releaseDate");
