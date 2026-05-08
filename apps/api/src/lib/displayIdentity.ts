/**
 * Single source of truth for the admin-facing user identity string.
 *
 * Steam OpenID auto-creates accounts with a synthetic email
 * `steam:{steamId}@hoard.internal` (see [routes/auth.ts:407]). Showing
 * that raw to Andrea in the admin panel would be unreadable noise, so
 * we surface a friendly "Steam user — {steamId}" instead. Regular
 * email-based accounts (register / Google) just return the email.
 *
 * Used by GET /api/admin/users + GET /api/admin/invite-codes
 * (usedBy.displayIdentity). If the format ever changes, one edit
 * here updates both surfaces.
 */
export function displayIdentity(user: { email: string; steamId: string | null }): string {
  if (user.steamId && user.email.startsWith('steam:') && user.email.endsWith('@hoard.internal')) {
    return `Steam user — ${user.steamId}`;
  }
  return user.email;
}
