/**
 * B-IGDB-3b2 — URL slug round-trip for IGDB tag values.
 *
 * IGDB tag names contain punctuation that doesn't belong in a URL path:
 *   "Role-playing (RPG)"           → "role-playing-rpg"
 *   "Hack and slash/Beat 'em up"   → "hack-and-slash-beat-em-up"
 *   "Sci-Fi"                       → "sci-fi"
 *
 * Slugs are NOT stable identifiers — they're derived from the current
 * tag-name string. If IGDB renames a tag, the slug changes. Acceptable
 * because:
 *   (a) IGDB tag renames are rare,
 *   (b) old bookmarks would just 404 to a generic "tag not found" view,
 *   (c) the alternative (storing IGDB IDs) requires a schema change.
 *
 * Resolution is lossy: multiple tag names could in theory collide on the
 * same slug. In practice IGDB's enumerated lists for genres/themes/
 * perspectives are small (~22/25/8) and don't collide. We don't
 * pre-validate; if a collision ever occurs, `findTagBySlug` returns the
 * first match in iteration order.
 */

/**
 * Slugify a tag name for use in a URL path segment.
 * - Lowercase
 * - Strip parens / quotes / `'` / etc.
 * - Replace any run of non-alphanumeric chars with a single hyphen
 * - Trim leading/trailing hyphens
 */
export function slugifyTag(name: string): string {
  return name
    .toLowerCase()
    // Apostrophes / quotes removed entirely (vs replaced by hyphen) so
    // "'em" stays joined → "em" rather than "-em-".
    .replace(/['’]/g, '')
    // Anything else non-alphanumeric becomes a hyphen.
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Find the canonical tag name in `allTags` whose slug equals `slug`.
 * Returns null when no match. Case-insensitive on the slug input as a
 * convenience for hand-typed URLs.
 */
export function findTagBySlug(allTags: readonly string[], slug: string): string | null {
  const target = slug.toLowerCase();
  for (const tag of allTags) {
    if (slugifyTag(tag) === target) return tag;
  }
  return null;
}
