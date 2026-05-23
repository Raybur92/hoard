export function minutesToHours(minutes: number): string {
  if (minutes === 0) return '—';
  const h = minutes / 60;
  return h >= 10 ? `${Math.round(h)}h` : `${h.toFixed(1)}h`;
}

export function formatRelative(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

export function daysUntil(iso: string | null, now: number = Date.now()): number {
  if (!iso) return 9999;
  return Math.ceil((new Date(iso).getTime() - now) / 86_400_000);
}

export function formatReleaseDate(iso: string | null): string {
  if (!iso) return 'TBA';
  return new Date(iso)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    .toUpperCase();
}

export function shortYear(releaseYear: number | null): string {
  if (!releaseYear) return '—';
  return `'${String(releaseYear).slice(2)}`;
}

export function generateReceipt(ugId: string, addedAt: string) {
  const short = ugId.replace(/[^a-z0-9]/gi, '').slice(0, 8).toUpperCase();
  return {
    ref: `HRD-${short.slice(0, 4)}`,
    barcode: `HRD-${short}-${new Date(addedAt).getFullYear()}`,
    date: new Date(addedAt)
      .toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' })
      .replace(/\//g, '-'),
  };
}

export function buildAsciiBar(pct: number, width = 40): string {
  const filled = Math.round((pct / 100) * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

export function totalPlaytimeMinutes(playtimeByPlatform: Partial<Record<string, number>>): number {
  return Object.values(playtimeByPlatform).reduce<number>((sum, m) => sum + (m ?? 0), 0);
}

export function dominantPlatform(pbp: Partial<Record<string, number>>): string {
  let best = { code: 'ST', minutes: -1 };
  for (const [code, min] of Object.entries(pbp)) {
    if ((min ?? 0) > best.minutes) best = { code, minutes: min ?? 0 };
  }
  return best.code;
}

/**
 * Row shape for the GameDetail PLATFORMS section. Owned rows come first
 * (sorted by playtime desc, matching the legacy OWNED ON ordering) followed
 * by wishlist-only rows (alphabetical). A code that appears in both lists
 * is treated as owned — the wishlist intent is satisfied by ownership and
 * shouldn't render twice.
 */
export type PlatformRow =
  | { code: string; kind: 'owned'; minutes: number }
  | { code: string; kind: 'wishlisted' };

export function buildPlatformRows(
  playtimeByPlatform: Partial<Record<string, number>>,
  wishlistedPlatforms: string[],
): PlatformRow[] {
  const owned: PlatformRow[] = Object.entries(playtimeByPlatform)
    .filter(([, min]) => min !== undefined)
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
    .map(([code, min]) => ({ code, kind: 'owned' as const, minutes: min ?? 0 }));
  const ownedCodes = new Set(owned.map((r) => r.code));
  const wishlistOnly: PlatformRow[] = wishlistedPlatforms
    .filter((code) => !ownedCodes.has(code))
    .sort()
    .map((code) => ({ code, kind: 'wishlisted' as const }));
  return [...owned, ...wishlistOnly];
}

export function upcomingDateParts(iso: string | null): { full: string; month: string; day: string; dow: string } {
  if (!iso) return { full: 'TBA', month: 'TBA', day: '—', dow: '—' };
  const d = new Date(iso);
  return {
    full: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase(),
    month: d.toLocaleString('en-US', { month: 'short' }).toUpperCase(),
    day: String(d.getDate()),
    dow: d.toLocaleString('en-US', { weekday: 'short' }).toUpperCase(),
  };
}

/**
 * Pick the right label for the trophies/achievements receipt-block line on
 * GameDetail (T5 in `docs/TROPHIES_PLAN.md`). PSN calls them "trophies",
 * Steam calls them "achievements" — Hoard renders the label that matches
 * the user's primary platform for the game.
 *
 * Inference rule: if the user has any PSN playtime on this game, use
 * "trophies" (Sony's brand term). Otherwise default to "achievements" (the
 * generic English term that fits Steam, Xbox, GOG). Single-platform users
 * get the right label; dual-platform games default to "trophies" because
 * Andrea is PSN-heavy and that's the more authentic read for trophy-hunter
 * culture.
 *
 * Note: this doesn't track which platform actually wrote the aggregate
 * data — Steam's background pass overwrites PSN's inline pass for
 * dual-platform games. Per-platform achievement storage is v2.
 */
export function achievementLabel(playtimeByPlatform: Partial<Record<string, number>>): 'trophies' | 'achievements' {
  return playtimeByPlatform.PS !== undefined ? 'trophies' : 'achievements';
}

export function countdownParts(iso: string | null, now: number = Date.now()): { d: string; h: string; m: string; s: string } | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return { d: '00', h: '00', m: '00', s: '00' };
  const totalSec = Math.floor(ms / 1000);
  const s = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const min = totalMin % 60;
  const totalHr = Math.floor(totalMin / 60);
  const hr = totalHr % 24;
  const d = Math.floor(totalHr / 24);
  const pad = (n: number) => String(n).padStart(2, '0');
  return { d: pad(d), h: pad(hr), m: pad(min), s: pad(s) };
}
