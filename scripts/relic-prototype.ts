/**
 * OQ-GD-13 — archivist-relic visual exploration.
 *
 * Prototype: take a handful of game covers, dither each into a grid of
 * unicode glyphs from the locked palette `█ ▓ ▒ ░ ◆ ◇ ·`, and render
 * both scales (full 24×24, shelf 8×8) side-by-side in an HTML preview
 * page that Andrea can open in a browser.
 *
 * Algorithm (server-side re-implementation of svg-dither-filter's
 * tone-bucketing approach):
 *   1. fetch cover image
 *   2. resize to N×N (sharp's nearest-neighbour-ish resize gives us the
 *      effect of cell averaging)
 *   3. convert pixel RGB → luminance via standard ITU-R BT.601 weights
 *   4. bucket luminance into 7 levels, map each to a glyph from the
 *      palette: darkest → densest fill (█), lightest → sparsest (·)
 *   5. render the grid as preformatted text
 *
 * Run: `npx tsx scripts/relic-prototype.ts`. Outputs `relic-prototype.html`
 * in the repo root; open it in a browser.
 */

import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';

interface Candidate {
  title: string;
  coverUrl: string;
}

const candidates: Candidate[] = [
  { title: 'Hollow Knight',  coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/coaes9.jpg' },
  { title: 'Bloodborne',     coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/cob99l.jpg' },
  { title: 'Hades',          coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co4rs3.jpg' },
  { title: 'Inside',         coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co2fca.jpg' },
  { title: 'Disco Elysium',  coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1sfj.jpg' },
  { title: 'Celeste',        coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/cob9dh.jpg' },
  { title: 'Cyberpunk 2077', coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/coaih8.jpg' },
  { title: 'The Witcher 3',  coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/coaarl.jpg' },
];

// All-block palette per Andrea 2026-06-01 (after iteration #1's mixed
// block + diamond + dot palette read as too fragmented). 5 glyphs, all
// full-block-width, only fill density varies. Highlights render as
// blank cells (still rectangular in the grid because <pre> preserves
// the whitespace) — gives an "inscribed marble" feel where deepest
// carvings stay dark and shallow ones fade to the page.
const HOUSE_PALETTE: readonly string[] = ['█', '▓', '▒', '░', ' '];

// Bucket boundaries: 0-255 luminance divided into N bands (N = palette
// length). Cell luminance L → bucket = clamp(floor(L * N / 256), 0, N-1).
function luminanceToBucket(L: number): number {
  const N = HOUSE_PALETTE.length;
  return Math.min(N - 1, Math.max(0, Math.floor((L * N) / 256)));
}

async function ditherCover(coverUrl: string, gridSize: number): Promise<string[]> {
  // Pull the cover image as raw RGB pixel data at the target grid
  // resolution. sharp's `resize` does proper area-average downsampling
  // so we get the right per-cell tone without manual averaging.
  const res = await fetch(coverUrl);
  if (!res.ok) throw new Error(`cover fetch ${coverUrl} failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());

  const { data, info } = await sharp(buf)
    .resize(gridSize, gridSize, { fit: 'cover' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.channels < 3) throw new Error(`unexpected channels: ${info.channels}`);

  const rows: string[] = [];
  for (let y = 0; y < gridSize; y++) {
    let row = '';
    for (let x = 0; x < gridSize; x++) {
      const i = (y * gridSize + x) * info.channels;
      const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
      // ITU-R BT.601 luma — the perceptual luminance most image
      // processing tools use as the default.
      const L = 0.299 * r + 0.587 * g + 0.114 * b;
      // Invert: lower luminance (darker pixel) → denser glyph (█),
      // higher luminance (lighter pixel) → sparser (·). So we read
      // the palette inverted from bucket index.
      const bucket = luminanceToBucket(255 - L);
      row += HOUSE_PALETTE[bucket];
    }
    rows.push(row);
  }
  return rows;
}

interface RelicSample {
  title: string;
  coverUrl: string;
  full: string[];   // 24×24
  shelf: string[];  // 8×8
}

async function buildSamples(): Promise<RelicSample[]> {
  const samples: RelicSample[] = [];
  for (const c of candidates) {
    try {
      const [full, shelf] = await Promise.all([
        ditherCover(c.coverUrl, 24),
        ditherCover(c.coverUrl, 8),
      ]);
      samples.push({ title: c.title, coverUrl: c.coverUrl, full, shelf });
      console.log(`✓ ${c.title}`);
    } catch (e) {
      console.error(`✗ ${c.title}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return samples;
}

function renderHtml(samples: RelicSample[]): string {
  const swatches = samples.map((s) => {
    const fullStr = s.full.join('\n');
    const shelfStr = s.shelf.join('\n');
    return `
      <section class="sample">
        <h2>${s.title}</h2>
        <div class="row">
          <div>
            <div class="label">// cover</div>
            <img src="${s.coverUrl}" alt="${s.title} cover" class="cover" />
          </div>
          <div>
            <div class="label">// full relic glyph · 24×24</div>
            <pre class="dither full">${fullStr}</pre>
          </div>
          <div>
            <div class="label">// shelf glyph · 8×8</div>
            <pre class="dither shelf">${shelfStr}</pre>
          </div>
        </div>
      </section>
    `;
  }).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Hoard — Archivist Relic Prototype (OQ-GD-13)</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet" />
  <style>
    :root {
      --void: #07090a;
      --ink: #0d1012;
      --ink-2: #14181b;
      --paper: #ece8de;
      --paper-dim: #a9a89e;
      --paper-faint: #6b6f72;
      --rule: #23292d;
      --amber: #d4a017;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0;
      background: var(--void);
      color: var(--paper);
      font-family: 'JetBrains Mono', ui-monospace, monospace;
      font-size: 14px;
      line-height: 1.55;
    }
    h1 {
      font-size: 22px;
      color: var(--amber);
      letter-spacing: 0.05em;
      margin: 0 0 6px;
    }
    .meta {
      color: var(--paper-faint);
      font-size: 11px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      margin-bottom: 28px;
    }
    .meta strong { color: var(--paper-dim); }
    main { padding: 36px 36px 80px; max-width: 1200px; }
    h2 {
      font-size: 18px;
      letter-spacing: 0.04em;
      margin: 0 0 16px;
      color: var(--paper);
    }
    .sample {
      border: 1px solid var(--rule);
      background: var(--ink);
      padding: 22px;
      margin-bottom: 22px;
    }
    .row {
      display: grid;
      grid-template-columns: 200px 1fr 1fr;
      gap: 32px;
      align-items: start;
    }
    .label {
      color: var(--paper-faint);
      font-size: 10px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      margin-bottom: 10px;
    }
    .cover {
      width: 180px;
      height: 240px;
      object-fit: cover;
      border: 1px solid var(--rule);
      display: block;
    }
    pre.dither {
      margin: 0;
      padding: 14px;
      background: var(--ink-2);
      border: 1px solid var(--rule);
      color: var(--paper);
      font-family: 'JetBrains Mono', ui-monospace, monospace;
      letter-spacing: 0.02em;
    }
    pre.dither.full {
      font-size: 13px;
      line-height: 1.0;
    }
    pre.dither.shelf {
      font-size: 22px;
      line-height: 1.0;
      width: max-content;
    }
    .palette {
      display: flex;
      gap: 16px;
      margin: 18px 0 28px;
      padding: 14px 18px;
      background: var(--ink);
      border: 1px solid var(--rule);
      font-size: 18px;
    }
    .palette span { color: var(--paper); }
    .palette small {
      color: var(--paper-faint);
      font-size: 9px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      margin-left: 6px;
    }
  </style>
</head>
<body>
  <main>
    <h1>// archivist relic — prototype</h1>
    <div class="meta">
      OQ-GD-13 · house palette <strong>${HOUSE_PALETTE.join(' ')}</strong> · per-game · no per-user variance
    </div>
    <div class="palette">
      ${HOUSE_PALETTE.map((g, i) => `<span>${g}<small>${i === 0 ? 'darkest' : i === 6 ? 'lightest' : `tone ${i + 1}`}</small></span>`).join('')}
    </div>
    ${swatches}
  </main>
</body>
</html>`;
}

async function main() {
  console.log('fetching + dithering covers…');
  const samples = await buildSamples();
  if (samples.length === 0) throw new Error('no samples produced');
  const html = renderHtml(samples);
  await writeFile('relic-prototype.html', html, 'utf-8');
  console.log(`\nwrote relic-prototype.html (${samples.length} samples). Open in a browser to eyeball.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
