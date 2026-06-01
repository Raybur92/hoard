/**
 * GD-PR4a — shape-dither renderer for the OQ-GD-13 archivist relic
 * centerpiece.
 *
 * Ported from scripts/relic-composition.ts. Same algorithm:
 *   1. Fetch the source image via the IGDB CDN URL
 *   2. Downsample to a 120×68 cell grid via sharp (area-average, not
 *      nearest-neighbour — sharp's default for `resize()`)
 *   3. Bucket each cell's luminance into one of 7 tonal levels
 *   4. Emit one SVG shape per non-empty cell from the locked vocabulary
 *      (svg-dither-filter method — varying shape PER cell instead of
 *      varying-size-same-shape halftone)
 *
 * Per GD-PR4-D7: each shape's wrapping `<g>` carries an inline
 * `style="animation-delay: Xms"` attribute computed from the cell's
 * Euclidean distance to the artwork centroid. The frontend animation
 * (5-stage consecration choreography) reads these directly — no JS-side
 * wave-distance computation needed at paint time.
 *
 * Output: ~120 × 68 = 8160 candidate cells; only non-zero-bucket cells
 * emit shapes (typically ~3500-6000 shape elements per relic depending
 * on artwork tonality). SVG size typically 15-30KB.
 */

import sharp from 'sharp';

const ART_COLS = 120;
const ART_ROWS = 68;
const ART_CELL = 6;
const SHAPE_BUCKETS = 7;

/**
 * D7 stage 3 — dither engrave fires from t=STAGE3_OFFSET to
 * t=STAGE3_OFFSET+MAX_WAVE_DELAY+~280 in the 5-stage choreography.
 * Each cell's individual animation lasts ~280ms (opacity 0→1 + scale
 * 0.6→1). We map cell distance from centroid linearly onto the wave
 * window: nearest cell fires at STAGE3_OFFSET, farthest cell fires at
 * STAGE3_OFFSET + MAX_WAVE_DELAY.
 *
 * Baking the stage-3 absolute offset into the SVG (rather than adding
 * it via CSS calc) lets the frontend keep a single CSS animation rule
 * with no per-element variable indirection. Trade-off: the timing is
 * hardcoded into the cached SVG, so retuning the choreography requires
 * regenerating all dithers (bump RELIC_DITHER_FORMAT_VERSION below to
 * force the self-healing invalidator to re-render on next read).
 */
const STAGE3_OFFSET_MS = 600;
const MAX_WAVE_DELAY_MS = 620;

/**
 * Source-comment format version. Stamped into the embedded source-URL
 * comment so cached SVGs from a prior format don't match against the
 * current heroImageUrl in relicCacheIsFresh — forces re-render. Bump
 * whenever the SVG output shape changes (e.g. animation timing,
 * cell shape vocabulary, sigil row, ...).
 */
const RELIC_DITHER_FORMAT_VERSION = 2;

interface CellLuma { x: number; y: number; L: number }

async function readCellLuminance(url: string, cols: number, rows: number): Promise<CellLuma[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`relicDither fetch ${url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const { data, info } = await sharp(buf)
    .resize(cols, rows, { fit: 'cover' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const cells: CellLuma[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * info.channels;
      const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
      const L = 0.299 * r + 0.587 * g + 0.114 * b;
      cells.push({ x, y, L });
    }
  }
  return cells;
}

function shapeForBucket(bucket: number, cx: number, cy: number, s: number): string {
  switch (bucket) {
    case 0: return '';
    case 1: return `<circle cx="${cx}" cy="${cy}" r="${(s * 0.12).toFixed(2)}"/>`;
    case 2: {
      const armLen = s * 0.65, armW = s * 0.15;
      const x1 = cx - armLen / 2, y1 = cy - armW / 2;
      const x2 = cx - armW / 2, y2 = cy - armLen / 2;
      return `<rect x="${x1.toFixed(1)}" y="${y1.toFixed(1)}" width="${armLen.toFixed(1)}" height="${armW.toFixed(1)}"/><rect x="${x2.toFixed(1)}" y="${y2.toFixed(1)}" width="${armW.toFixed(1)}" height="${armLen.toFixed(1)}"/>`;
    }
    case 3: {
      const r = s * 0.35;
      return `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(2)}" fill="none" stroke="#ece8de" stroke-width="${(s * 0.18).toFixed(2)}"/>`;
    }
    case 4: {
      const r = s * 0.45;
      return `<polygon points="${cx},${(cy - r).toFixed(2)} ${(cx + r).toFixed(2)},${cy} ${cx},${(cy + r).toFixed(2)} ${(cx - r).toFixed(2)},${cy}"/>`;
    }
    case 5: return `<circle cx="${cx}" cy="${cy}" r="${(s * 0.42).toFixed(2)}"/>`;
    case 6:
    default: {
      const a = s * 0.85;
      return `<rect x="${(cx - a / 2).toFixed(2)}" y="${(cy - a / 2).toFixed(2)}" width="${a.toFixed(2)}" height="${a.toFixed(2)}"/>`;
    }
  }
}

function luminanceToShapeBucket(L: number): number {
  return Math.min(SHAPE_BUCKETS - 1, Math.max(0, Math.floor((L * SHAPE_BUCKETS) / 256)));
}

function renderShapeDither(cells: CellLuma[], cols: number, rows: number, cell: number): string {
  const w = cols * cell;
  const h = rows * cell;
  // D7 — radial wave from the artwork centroid (cell coordinates, NOT
  // pixel coordinates, since the wave reads more naturally on the grid
  // structure than on the rendered SVG).
  const cxGrid = (cols - 1) / 2;
  const cyGrid = (rows - 1) / 2;
  const maxDist = Math.sqrt(cxGrid * cxGrid + cyGrid * cyGrid);

  let groups = '';
  for (const c of cells) {
    const bucket = luminanceToShapeBucket(c.L);
    if (bucket === 0) continue;
    const cx = c.x * cell + cell / 2;
    const cy = c.y * cell + cell / 2;
    const shape = shapeForBucket(bucket, cx, cy, cell);
    if (!shape) continue;
    const dx = c.x - cxGrid;
    const dy = c.y - cyGrid;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const delayMs = STAGE3_OFFSET_MS + Math.round((dist / maxDist) * MAX_WAVE_DELAY_MS);
    // Wrapping each shape in a `<g>` lets the frontend target every cell
    // uniformly via `.relic-dither g { animation: ... }` while reading
    // the per-cell delay from the inline style.
    groups += `<g class="rd-cell" style="animation-delay:${delayMs}ms">${shape}</g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" class="relic-dither">`
    + `<rect x="0" y="0" width="${w}" height="${h}" fill="#07090a"/>`
    + `<g fill="#ece8de">${groups}</g>`
    + `</svg>`;
}

/**
 * Source URL is embedded as an XML comment at the top of the SVG so we
 * can validate on read whether the cached dither still matches the
 * Game's current heroImageUrl (self-healing invalidation — no per-writer
 * cache-bust required when heroImageUrl changes via sync / rescore /
 * wishlist add / etc).
 *
 * Sniff via `extractRelicSource(svg)`; mismatch → treat as null + kick
 * off re-render.
 */
const SOURCE_COMMENT_PREFIX = '<!-- src=';
const SOURCE_COMMENT_SUFFIX = ' -->';

export function extractRelicSource(svg: string | null | undefined): string | null {
  if (!svg) return null;
  const start = svg.indexOf(SOURCE_COMMENT_PREFIX);
  if (start === -1) return null;
  const end = svg.indexOf(SOURCE_COMMENT_SUFFIX, start);
  if (end === -1) return null;
  return svg.slice(start + SOURCE_COMMENT_PREFIX.length, end);
}

function escapeForXmlComment(s: string): string {
  // XML comments forbid `--` inside; replace defensively. IGDB URLs
  // don't contain `--` naturally so this is paranoid but cheap.
  return s.replace(/--/g, '-_');
}

/**
 * Public entry — fetch a hero image URL, render its shape-dither SVG.
 * Throws on network failure or sharp decode error (caller wraps in
 * try/catch and persists null + falls back to cover on the frontend).
 */
export async function renderRelicDither(heroImageUrl: string): Promise<string> {
  const cells = await readCellLuminance(heroImageUrl, ART_COLS, ART_ROWS);
  const body = renderShapeDither(cells, ART_COLS, ART_ROWS, ART_CELL);
  // Inject the source-URL comment immediately after the opening `<svg>`
  // tag so `extractRelicSource` finds it without parsing the whole SVG.
  // Inject the source-URL comment after the closing `>` of the opening
  // `<svg ...>` tag so the XML stays valid. Comments are invalid inside
  // a tag's attribute list. Version-stamp the URL so SVGs from a prior
  // format don't match against current heroImageUrl in
  // `relicCacheIsFresh` — forces re-render via the route's lazy path.
  const stamped = `${escapeForXmlComment(heroImageUrl)};fmt=${RELIC_DITHER_FORMAT_VERSION}`;
  return body.replace(
    'class="relic-dither">',
    `class="relic-dither">${SOURCE_COMMENT_PREFIX}${stamped}${SOURCE_COMMENT_SUFFIX}`,
  );
}

/** Constants exported for the frontend animation orchestrator to read. */
export const RELIC_DITHER_CONSTANTS = {
  ART_COLS,
  ART_ROWS,
  ART_CELL,
  MAX_WAVE_DELAY_MS,
} as const;
