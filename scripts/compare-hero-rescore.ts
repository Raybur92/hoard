/**
 * B-Art-1 eyeball helper — generates a side-by-side HTML page comparing
 * every old→new heroImageUrl swap that `rescore-game-hero-image.ts`
 * would make. Open the output in a browser, spot-check, then decide
 * whether to run the real rescore.
 *
 * Same scope as `rescore-game-hero-image.ts` (Library-overview union).
 * For each in-scope Game: call getGame(igdbId) → compare the scored
 * heroImageUrl to the stored one → if different, emit a comparison row.
 *
 * Output: `relic-hero-rescore-comparison.html` at repo root (gitignored).
 *
 * Usage:
 *   npx tsx scripts/compare-hero-rescore.ts
 */
import { config } from 'dotenv';
config({ path: new URL('../apps/api/.env', import.meta.url).pathname });

import { PrismaClient } from '@prisma/client';
import { writeFile } from 'node:fs/promises';
import { getGame } from '../apps/api/src/services/igdb';

const prisma = new PrismaClient();

const REQ_DELAY_MS = 350; // ~3 req/s — under IGDB's 4/s budget
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface Pair {
  title: string;
  igdbId: number;
  oldUrl: string | null;
  newUrl: string;
}

async function main(): Promise<void> {
  const PER_STATUS = 12;
  const STATUSES = ['Playing', 'OnHold', 'Completed', 'Backlog', 'Dropped'] as const;
  const users = await prisma.user.findMany({ select: { id: true } });
  const gameIds = new Set<string>();
  for (const u of users) {
    for (const status of STATUSES) {
      const rows = await prisma.userGame.findMany({
        where: { userId: u.id, status },
        orderBy: { lastPlayedAt: 'desc' },
        take: PER_STATUS,
        select: { gameId: true },
      });
      rows.forEach((r) => gameIds.add(r.gameId));
    }
    const wishlistRows = await prisma.userGame.findMany({
      where: {
        userId: u.id,
        OR: [{ status: 'Wishlist' }, { wishlistedPlatforms: { isEmpty: false } }],
      },
      orderBy: { addedAt: 'desc' },
      take: PER_STATUS,
      select: { gameId: true },
    });
    wishlistRows.forEach((r) => gameIds.add(r.gameId));
  }
  const rows = await prisma.game.findMany({
    where: { id: { in: [...gameIds] } },
    select: { id: true, igdbId: true, title: true, heroImageUrl: true },
  });

  console.log(`[compare-hero] ${rows.length} candidate game(s) — scoring…`);

  const pairs: Pair[] = [];
  let i = 0;
  for (const row of rows) {
    i++;
    try {
      const g = await getGame(row.igdbId);
      if (!g) {
        await sleep(REQ_DELAY_MS);
        continue;
      }
      const newUrl = g.heroImageUrl;
      if (newUrl && newUrl !== row.heroImageUrl) {
        pairs.push({ title: row.title, igdbId: row.igdbId, oldUrl: row.heroImageUrl, newUrl });
        console.log(`[compare-hero] [${i}/${rows.length}] ${row.title} — swap captured`);
      }
    } catch (err) {
      console.error(`[compare-hero] [${i}/${rows.length}] ${row.title} (igdbId=${row.igdbId}) — error:`, err instanceof Error ? err.message : err);
    }
    await sleep(REQ_DELAY_MS);
  }

  console.log(`\n[compare-hero] ${pairs.length} swap(s) to render`);
  const html = renderHtml(pairs);
  await writeFile('relic-hero-rescore-comparison.html', html, 'utf-8');
  console.log(`[compare-hero] wrote relic-hero-rescore-comparison.html`);
  await prisma.$disconnect();
}

function renderHtml(pairs: Pair[]): string {
  const cards = pairs.map((p, idx) => `
    <article class="row" data-idx="${idx}">
      <div class="idx">#${(idx + 1).toString().padStart(3, '0')}</div>
      <div class="meta">
        <div class="title">${escapeHtml(p.title)}</div>
        <div class="igdb">igdbId · ${p.igdbId}</div>
      </div>
      <div class="pair">
        <figure class="cell old">
          <figcaption>OLD <span class="hint">·  ${shortId(p.oldUrl)}</span></figcaption>
          ${p.oldUrl
            ? `<img src="${escapeAttr(p.oldUrl)}" loading="lazy" alt="old hero image for ${escapeAttr(p.title)}"/>`
            : '<div class="empty">(null)</div>'}
        </figure>
        <figure class="cell new">
          <figcaption>NEW <span class="hint">·  ${shortId(p.newUrl)}</span></figcaption>
          <img src="${escapeAttr(p.newUrl)}" loading="lazy" alt="new hero image for ${escapeAttr(p.title)}"/>
        </figure>
      </div>
    </article>
  `).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Hoard — Hero Image Rescore Comparison (B-Art-1)</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet"/>
  <style>
    :root {
      --void: #07090a; --ink: #0d1012; --ink-2: #14181b;
      --paper: #ece8de; --paper-dim: #a9a89e; --paper-faint: #6b6f72;
      --rule: #23292d; --amber: #d4a017; --green: #5fc26a; --red: #e2553a;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: var(--void); color: var(--paper); font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 13px; line-height: 1.5; }
    main { padding: 28px 32px 80px; max-width: 1400px; margin: 0 auto; }
    h1 { font-size: 18px; color: var(--amber); letter-spacing: 0.05em; margin: 0 0 6px; }
    .meta-line { color: var(--paper-faint); font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 28px; }
    .row {
      display: grid;
      grid-template-columns: 60px 1fr;
      grid-template-rows: auto auto;
      gap: 4px 18px;
      align-items: start;
      padding: 18px 0;
      border-bottom: 1px solid var(--rule);
    }
    .idx {
      grid-row: 1 / span 2;
      color: var(--paper-faint);
      font-size: 11px;
      letter-spacing: 0.14em;
      padding-top: 4px;
    }
    .meta { grid-column: 2; }
    .title { color: var(--paper); font-size: 14px; letter-spacing: 0.04em; }
    .igdb { color: var(--paper-faint); font-size: 10px; letter-spacing: 0.12em; margin-top: 2px; }
    .pair {
      grid-column: 2;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 18px;
      margin-top: 10px;
    }
    figure.cell { margin: 0; }
    figure.cell figcaption {
      color: var(--paper-faint);
      font-size: 10px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      margin-bottom: 6px;
      display: flex;
      align-items: baseline;
      justify-content: space-between;
    }
    figure.cell.old figcaption { color: var(--red); }
    figure.cell.new figcaption { color: var(--green); }
    figure.cell .hint { color: var(--paper-faint); font-size: 9px; letter-spacing: 0.1em; text-transform: none; }
    figure.cell img {
      display: block;
      width: 100%;
      aspect-ratio: 16 / 9;
      object-fit: cover;
      background: var(--ink);
      border: 1px solid var(--rule);
    }
    figure.cell .empty {
      width: 100%;
      aspect-ratio: 16 / 9;
      background: var(--ink-2);
      border: 1px dashed var(--rule);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--paper-faint);
      font-size: 11px;
      letter-spacing: 0.16em;
    }
    .nav {
      position: sticky;
      top: 0;
      background: var(--void);
      padding: 16px 0;
      border-bottom: 1px solid var(--rule);
      margin-bottom: 12px;
      z-index: 10;
      display: flex;
      gap: 16px;
      align-items: baseline;
    }
    .count {
      color: var(--paper-dim);
      font-size: 11px;
      letter-spacing: 0.12em;
    }
    .legend {
      color: var(--paper-faint);
      font-size: 10px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }
    .legend .red { color: var(--red); }
    .legend .green { color: var(--green); }
  </style>
</head>
<body>
  <main>
    <div class="nav">
      <h1>// hero rescore · comparison</h1>
      <span class="count">${pairs.length} swap${pairs.length === 1 ? '' : 's'}</span>
      <span class="legend"><span class="red">OLD</span> · current heroImageUrl &nbsp; <span class="green">NEW</span> · scored pick</span>
    </div>
    <div class="meta-line">B-Art-1 dry-run preview · scroll to spot-check · regressions = un-rescore that game manually after the real run</div>
    ${cards}
  </main>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;');
}

function shortId(url: string | null): string {
  if (!url) return '—';
  const m = url.match(/\/([^/]+)\.jpg$/);
  return m ? m[1]! : url;
}

void main();
