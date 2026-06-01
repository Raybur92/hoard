/**
 * OQ-GD-13 — halftone iteration (replaces relic-prototype.ts).
 *
 * Per Andrea's moodboard (2026-06-01): halftone is the dithering
 * technique we want, not block-shading. The James Blake cover + the
 * Logos eye demonstrate the property — halftone preserves photographic
 * detail at micro-scale while reading graphic at macro-scale. Block
 * shading at 5 levels collapses too much detail to "see the game."
 *
 * Algorithm:
 *   1. fetch cover
 *   2. sharp resize to cols × rows (high resolution — 60×80 typical)
 *   3. per cell: compute luminance via ITU-R BT.601 weights
 *   4. render an SVG circle per cell; radius proportional to luminance
 *      (light pixel → big bright dot, dark pixel → small/no dot)
 *   5. light dots on void background — clusters of dots form the
 *      bright regions of the original cover
 *
 * Two layout variants per cover so we can pick the rhythm:
 *   A. aligned grid — rectangular, every cell on the grid (clinical)
 *   B. offset grid — every other row shifted by half a cell
 *      (newspaper-halftone, more organic / hand-set feel)
 *
 * Run: `npx tsx scripts/relic-halftone.ts`. Outputs `relic-halftone.html`.
 */

import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';

interface Candidate {
  title: string;
  coverUrl: string;            // IGDB t_cover_big — portrait 3:4, often has logo / title
  artworkUrl: string | null;   // IGDB t_screenshot_big (Game.heroImageUrl) — landscape 16:9, no text
}

// Artworks scored + curated 2026-06-01 via `scripts/probe-artworks.ts`
// (see CLAUDE.md Known Gap "Hero artwork source-quality variance" for
// the smarter-selection scoring rules). Second pass after Andrea's
// eyeball:
//   - Hades switched to artwork from igdbId 113112 (16 artworks available);
//     the seed-issue 80529 had none.
//   - Inside swapped from the 1-artwork pool (had a logo) to a screenshot.
//   - Cyberpunk reverted to `ar3m0k` — the high-scored 4K artwork was
//     a marketing piece with text that didn't dither as well.
//   - Hollow Knight stays on the only available screenshot — needs
//     SteamGridDB (B-Art-2 future workstream) for a real upgrade.
const candidates: Candidate[] = [
  { title: 'Hollow Knight',  coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/coaes9.jpg', artworkUrl: 'https://images.igdb.com/igdb/image/upload/t_screenshot_huge/scyytz.jpg' },
  { title: 'Bloodborne',     coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/cob99l.jpg', artworkUrl: 'https://images.igdb.com/igdb/image/upload/t_screenshot_huge/ar3mkv.jpg' },
  { title: 'Hades',          coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co4rs3.jpg', artworkUrl: 'https://images.igdb.com/igdb/image/upload/t_screenshot_huge/ar3m4o.jpg' },
  { title: 'Inside',         coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co2fca.jpg', artworkUrl: 'https://images.igdb.com/igdb/image/upload/t_screenshot_huge/z4fkserflyby1nv5ispe.jpg' },
  { title: 'Disco Elysium',  coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1sfj.jpg', artworkUrl: 'https://images.igdb.com/igdb/image/upload/t_screenshot_huge/ar4m5.jpg' },
  { title: 'Celeste',        coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/cob9dh.jpg', artworkUrl: 'https://images.igdb.com/igdb/image/upload/t_screenshot_huge/ar523z.jpg' },
  { title: 'Cyberpunk 2077', coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/coaih8.jpg', artworkUrl: 'https://images.igdb.com/igdb/image/upload/t_screenshot_huge/ar3m0k.jpg' },
  { title: 'The Witcher 3',  coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/coaarl.jpg', artworkUrl: 'https://images.igdb.com/igdb/image/upload/t_screenshot_huge/ar3lzn.jpg' },
];

// House parameters. Game covers are typically 3:4 aspect; the grid
// mirrors that. 60×80 cells at 8 px per cell → 480×640 SVG. Plenty of
// resolution to preserve recognizable silhouettes without becoming a
// raster image.
// Cover grid (portrait 3:4 — matches IGDB t_cover_big)
const COVER_COLS = 60;
const COVER_ROWS = 80;
const COVER_CELL = 8;
// Artwork grid (landscape 16:9 — matches IGDB t_screenshot_big)
const ART_COLS = 80;
const ART_ROWS = 45;
const ART_CELL = 8;
// Halftone density locked to r0.50 (tangent — Andrea 2026-06-01) for
// the full vs shelf comparison.

interface CellLuma { x: number; y: number; L: number }

async function readCellLuminance(coverUrl: string, cols: number, rows: number): Promise<CellLuma[]> {
  const res = await fetch(coverUrl);
  if (!res.ok) throw new Error(`cover fetch failed: ${res.status}`);
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

function renderHalftoneSvg(cells: CellLuma[], cols: number, rows: number, cell: number, density: number): string {
  const w = cols * cell;
  const h = rows * cell;
  const maxR = cell * density;
  const minR = 0;
  // Skip-dot threshold scales with cell size so small-cell renders
  // don't drop everything but the brightest dots.
  const skip = cell * 0.05;

  let dots = '';
  for (const c of cells) {
    const t = c.L / 255;
    const radius = minR + (maxR - minR) * t;
    if (radius < skip) continue;
    const cx = c.x * cell + cell / 2;
    const cy = c.y * cell + cell / 2;
    dots += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${radius.toFixed(2)}"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet">
  <rect x="0" y="0" width="${w}" height="${h}" fill="#07090a"/>
  <g fill="#ece8de">${dots}</g>
</svg>`;
}

/* ── svg-dither-filter method (full): different geometric SHAPE per
 * tonal bucket (7 levels) ── */

const SHAPE_BUCKETS = 7;

// Each entry returns the SVG snippet for one tonal bucket, drawn into a
// cell of edge length `s` centred at (cx, cy). Ordered dark → light: at
// bucket 0 we render nothing (cell stays void); at bucket 6 we render
// the most ink (a full block). Mid-buckets walk through a vocabulary
// of geometric primitives so brighter regions read as a denser/heavier
// mark — same intent as our halftone, but with varied shapes per cell
// (the visual signature of svg-dither-filter).
function shapeForBucket(bucket: number, cx: number, cy: number, s: number, rotateDeg: number): string {
  const half = s / 2;
  // Apply rotation per cell when requested (rotateDeg is 0 for the
  // no-rotation variant). All shapes rotate around (cx, cy) so the
  // SVG transform stays uniform.
  const transform = rotateDeg ? ` transform="rotate(${rotateDeg} ${cx} ${cy})"` : '';
  switch (bucket) {
    case 0: return ''; // empty cell — preserves void background in dark regions
    case 1: return `<circle cx="${cx}" cy="${cy}" r="${(s * 0.12).toFixed(2)}"/>`; // tiny dot
    case 2: {
      // plus / cross — two thin rectangles
      const armLen = s * 0.65;
      const armW = s * 0.15;
      const x1 = cx - armLen / 2, y1 = cy - armW / 2;
      const x2 = cx - armW / 2, y2 = cy - armLen / 2;
      return `<g${transform}><rect x="${x1.toFixed(1)}" y="${y1.toFixed(1)}" width="${armLen.toFixed(1)}" height="${armW.toFixed(1)}"/><rect x="${x2.toFixed(1)}" y="${y2.toFixed(1)}" width="${armW.toFixed(1)}" height="${armLen.toFixed(1)}"/></g>`;
    }
    case 3: {
      // hollow ring
      const r = s * 0.35;
      const stroke = (s * 0.18).toFixed(2);
      return `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(2)}" fill="none" stroke="#ece8de" stroke-width="${stroke}"/>`;
    }
    case 4: {
      // filled diamond (rotated square)
      const r = s * 0.45;
      const points = `${cx},${(cy - r).toFixed(2)} ${(cx + r).toFixed(2)},${cy} ${cx},${(cy + r).toFixed(2)} ${(cx - r).toFixed(2)},${cy}`;
      return `<polygon points="${points}"${transform}/>`;
    }
    case 5: {
      // filled circle, medium
      return `<circle cx="${cx}" cy="${cy}" r="${(s * 0.42).toFixed(2)}"/>`;
    }
    case 6:
    default: {
      // full block — biggest ink mark; renders as a square slightly
      // smaller than the cell so the grid stays visible
      const a = s * 0.85;
      return `<rect x="${(cx - a / 2).toFixed(2)}" y="${(cy - a / 2).toFixed(2)}" width="${a.toFixed(2)}" height="${a.toFixed(2)}"${transform}/>`;
    }
  }
}

function luminanceToShapeBucket(L: number): number {
  return Math.min(SHAPE_BUCKETS - 1, Math.max(0, Math.floor((L * SHAPE_BUCKETS) / 256)));
}

// Deterministic per-cell rotation (0 / 90 / 180 / 270) seeded by grid
// coordinate so every relic renders the same pattern. Same igdbId
// always produces the same image (Andrea's lock: no per-user variance).
function cellRotation(x: number, y: number): number {
  const h = ((x * 31) ^ (y * 17)) & 0xff;
  return (h % 4) * 90;
}

function renderShapeDitherSvg(cells: CellLuma[], cols: number, rows: number, cell: number, rotate: boolean): string {
  const w = cols * cell;
  const h = rows * cell;

  let marks = '';
  for (const c of cells) {
    const bucket = luminanceToShapeBucket(c.L);
    if (bucket === 0) continue;
    const cx = c.x * cell + cell / 2;
    const cy = c.y * cell + cell / 2;
    const rot = rotate ? cellRotation(c.x, c.y) : 0;
    marks += shapeForBucket(bucket, cx, cy, cell, rot);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet">
  <rect x="0" y="0" width="${w}" height="${h}" fill="#07090a"/>
  <g fill="#ece8de">${marks}</g>
</svg>`;
}

interface Sample {
  title: string;
  coverUrl: string;
  artworkUrl: string;        // may equal coverUrl as a fallback
  artworkSourceLabel: string; // "artwork (IGDB hero)" or "artwork (cover fallback)"
  // Cover-sourced dithers (portrait 60×80)
  coverHalftone: string;
  coverShape: string;
  // Artwork-sourced dithers (landscape 80×45 when native artwork available)
  artworkHalftone: string;
  artworkShape: string;
}

async function buildSamples(): Promise<Sample[]> {
  const out: Sample[] = [];
  for (const c of candidates) {
    try {
      const coverCells = await readCellLuminance(c.coverUrl, COVER_COLS, COVER_ROWS);

      // Artwork sample: native landscape artwork when available, fall
      // back to cover so every game still gets a second column. The
      // fallback uses the SAME portrait grid as the cover column so the
      // viewer can tell when there's no native artwork.
      const hasArtwork = c.artworkUrl !== null;
      const artworkSrc = c.artworkUrl ?? c.coverUrl;
      const artworkCells = hasArtwork
        ? await readCellLuminance(artworkSrc, ART_COLS, ART_ROWS)
        : await readCellLuminance(artworkSrc, COVER_COLS, COVER_ROWS);
      const artworkCols = hasArtwork ? ART_COLS : COVER_COLS;
      const artworkRows = hasArtwork ? ART_ROWS : COVER_ROWS;
      const artworkCell = hasArtwork ? ART_CELL : COVER_CELL;

      out.push({
        title: c.title,
        coverUrl: c.coverUrl,
        artworkUrl: artworkSrc,
        artworkSourceLabel: hasArtwork ? 'artwork · IGDB hero (landscape)' : 'artwork · cover fallback (no native hero)',
        coverHalftone: renderHalftoneSvg(coverCells, COVER_COLS, COVER_ROWS, COVER_CELL, 0.50),
        coverShape:    renderShapeDitherSvg(coverCells, COVER_COLS, COVER_ROWS, COVER_CELL, false),
        artworkHalftone: renderHalftoneSvg(artworkCells, artworkCols, artworkRows, artworkCell, 0.50),
        artworkShape:    renderShapeDitherSvg(artworkCells, artworkCols, artworkRows, artworkCell, false),
      });
      console.log(`✓ ${c.title}${hasArtwork ? '' : ' (no artwork — fell back to cover)'}`);
    } catch (e) {
      console.error(`✗ ${c.title}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return out;
}

function renderHtml(samples: Sample[]): string {
  const sections = samples.map((s) => `
    <section class="sample">
      <h2>${s.title}</h2>
      <div class="row">
        <div>
          <div class="label">// cover (storefront, has title)</div>
          <img src="${s.coverUrl}" alt="${s.title} cover" class="cover"/>
        </div>
        <div>
          <div class="label">// cover · halftone r0.50</div>
          <div class="halftone">${s.coverHalftone}</div>
        </div>
        <div>
          <div class="label">// cover · shape-dither</div>
          <div class="halftone">${s.coverShape}</div>
        </div>
      </div>
      <div class="row" style="margin-top: 18px;">
        <div>
          <div class="label">// ${s.artworkSourceLabel}</div>
          <img src="${s.artworkUrl}" alt="${s.title} artwork" class="cover landscape"/>
        </div>
        <div>
          <div class="label">// artwork · halftone r0.50</div>
          <div class="halftone">${s.artworkHalftone}</div>
        </div>
        <div>
          <div class="label">// artwork · shape-dither</div>
          <div class="halftone">${s.artworkShape}</div>
        </div>
      </div>
    </section>
  `).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Hoard — Relic Halftone Iteration (OQ-GD-13)</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet"/>
  <style>
    :root {
      --void: #07090a; --ink: #0d1012; --ink-2: #14181b;
      --paper: #ece8de; --paper-dim: #a9a89e; --paper-faint: #6b6f72;
      --rule: #23292d; --amber: #d4a017;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: var(--void); color: var(--paper); font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 14px; }
    h1 { font-size: 22px; color: var(--amber); letter-spacing: 0.05em; margin: 0 0 6px; }
    .meta { color: var(--paper-faint); font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 28px; }
    main { padding: 36px 36px 80px; max-width: 1500px; }
    h2 { font-size: 18px; letter-spacing: 0.04em; margin: 0 0 16px; color: var(--paper); }
    .sample { border: 1px solid var(--rule); background: var(--ink); padding: 22px; margin-bottom: 22px; }
    .row { display: grid; grid-template-columns: 220px 1fr 1fr; gap: 32px; align-items: start; }
    .label { color: var(--paper-faint); font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 10px; }
    .cover { width: 200px; height: 267px; object-fit: cover; border: 1px solid var(--rule); display: block; }
    .cover.landscape { width: 200px; height: 113px; }
    .halftone { border: 1px solid var(--rule); background: var(--void); padding: 0; line-height: 0; }
    .halftone svg { display: block; width: 100%; height: auto; }
    /* shelf-scale renders display at their NATIVE pixel size — the
       whole point is to see how small they actually are when used as a
       card-corner glyph. No CSS scaling. */
    .shelf-render { border: 1px solid var(--rule); background: var(--void); padding: 0; line-height: 0; display: inline-block; }
    .shelf-render svg { display: block; image-rendering: pixelated; }
  </style>
</head>
<body>
  <main>
    <h1>// archivist relic — halftone iteration</h1>
    <div class="meta">
      OQ-GD-13 · source comparison: storefront cover (portrait ${COVER_COLS}×${COVER_ROWS}) vs IGDB artwork (landscape ${ART_COLS}×${ART_ROWS}) · each rendered as halftone r0.50 + shape-dither · cell ${COVER_CELL}px
    </div>
    ${sections}
  </main>
</body>
</html>`;
}

async function main() {
  console.log(`halftone + shape-dither (full + shelf scales)…`);
  const samples = await buildSamples();
  if (samples.length === 0) throw new Error('no samples produced');
  const html = renderHtml(samples);
  const tagPath = `iterations/dither-compare-cover-vs-artwork.html`;
  await Promise.all([
    writeFile('relic-halftone.html', html, 'utf-8'),
    writeFile(tagPath, html, 'utf-8'),
  ]);
  console.log(`\nwrote relic-halftone.html + ${tagPath} (${samples.length} samples). Open in a browser to eyeball.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
