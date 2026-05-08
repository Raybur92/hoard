/**
 * Open-redirect defense for the `?next=…` query param on /welcome.
 *
 * Per docs/INVITE_CODES_PLAN.md I-D1, `next` is honored only when:
 *   (a) it starts with `/`            — restricts to same-origin paths
 *   (b) it does NOT start with `//`   — protocol-relative URLs would
 *                                       point off-domain (`//evil.com`)
 *   (c) it does NOT contain `:` before any `/` — catches absolute-URL
 *                                       attempts (`https://evil.com`,
 *                                       `javascript:alert(1)`); already
 *                                       implied by (a)+(b) but checked
 *                                       explicitly so the safety story
 *                                       stays bulletproof under future
 *                                       refactors of (a).
 *
 * Anything else falls back to `/`. Used by WelcomeScreen post-redemption
 * navigation and any other consumer of the `next` param.
 */
export function safeNext(value: string | null | undefined): string {
  if (typeof value !== 'string' || value.length === 0) return '/';
  if (!value.startsWith('/')) return '/';
  if (value.startsWith('//')) return '/';

  const slashIdx = value.indexOf('/');
  const colonIdx = value.indexOf(':');
  if (colonIdx !== -1 && colonIdx < slashIdx) return '/';

  return value;
}
