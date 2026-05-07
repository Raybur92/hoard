-- Adds a per-platform sync cadence so the picker UI on PlatformDetail
-- (desktop + mobile sync tab) stops being decorative.
--
-- The client's `useAutoSync` hook reads this value and triggers
-- `POST /api/platforms/:code/sync` on app open + on visibility-change +
-- on a once-per-minute interval, whenever any platform's `lastSyncAt` is
-- older than its `syncFrequency` window.
--
-- Default HOURLY: Steam/PSN libraries don't change often enough to warrant
-- a sub-hour poll for a personal-tool workload. Users can opt in to faster
-- cadences from the Sync tab; MANUAL disables auto-sync entirely (manual
-- "sync now" button still works).

CREATE TYPE "SyncFrequency" AS ENUM ('FIVE_MIN', 'FIFTEEN_MIN', 'HOURLY', 'MANUAL');

ALTER TABLE "Platform"
  ADD COLUMN "syncFrequency" "SyncFrequency" NOT NULL DEFAULT 'HOURLY';
