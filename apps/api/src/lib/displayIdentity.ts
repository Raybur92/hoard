/**
 * Single source of truth for the admin-facing user identity string.
 *
 * Steam OpenID auto-creates accounts with a synthetic email
 * `steam:{steamId}@hoard.internal` (see [routes/auth.ts:407]). Showing
 * that raw to Andrea in the admin panel would be unreadable noise, so
 * for those accounts we prefer the human handle that the Steam OAuth
 * flow already populates from `GetPlayerSummaries` (`User.name` —
 * "Bedkarma", not the Steam64 ID), falling back to
 * `Steam user — {steamId}` only when the handle is null (private
 * profile or `GetPlayerSummaries` failure). Regular email-based
 * accounts (register / Google) just return the email — those have
 * a human-recognizable identifier already.
 *
 * Fallback order:
 *   1. Real (non-synthetic) email → `email`
 *   2. Synthetic email + name set → `name`
 *   3. Synthetic email + name null → `Steam user — {steamId}`
 *
 * Used by GET /api/admin/users + GET /api/admin/invite-codes
 * (usedBy.displayIdentity). If the format ever changes, one edit
 * here updates both surfaces.
 */
export function displayIdentity(user: {
  email: string;
  name: string | null;
  steamId: string | null;
}): string {
  const isSynthetic =
    user.steamId !== null &&
    user.email.startsWith('steam:') &&
    user.email.endsWith('@hoard.internal');
  if (!isSynthetic) return user.email;
  if (user.name && user.name.length > 0) return user.name;
  return `Steam user — ${user.steamId}`;
}
