/**
 * IGDB cover URL size variants.
 *
 * Stored URLs use `t_cover_big` (264×374). For mobile shelves rendering 84×112
 * covers, substitute `t_cover_small` (90×128) — about 6× less bandwidth per
 * image. Desktop covers (130–200 px) keep the current `t_cover_big`.
 *
 * IGDB ignores the size token in the URL path that doesn't match a real
 * variant, so substitution is safe for any `t_cover_*` prefix.
 *
 * Sizes: https://api-docs.igdb.com/#images
 *   t_cover_small  90×128
 *   t_cover_med    264×374
 *   t_cover_big    264×374
 *   t_cover_big_2x 528×748
 */
export function igdbCoverSize(url: string | null | undefined, targetW: number): string | null {
  if (!url) return null;
  if (!url.includes('images.igdb.com')) return url;
  const variant = targetW <= 90 ? 't_cover_small' : 't_cover_big';
  return url.replace(/t_cover_(small|med|big|big_2x|original|thumb)/, variant);
}
