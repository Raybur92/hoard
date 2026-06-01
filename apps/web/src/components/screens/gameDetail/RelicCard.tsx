/**
 * GD-PR4b — the archivist relic card (OQ-GD-13).
 *
 * Shared between S4Desktop + S4Mobile. Composes 5 layers:
 *   1. Top label band — REF / BASE MATERIAL / SEALED / barcode
 *   2. Dithered centerpiece — SVG rendered server-side, inlined via
 *      dangerouslySetInnerHTML so the frontend animation can target the
 *      embedded `<g class="rd-cell">` groups directly.
 *   3. Title + byline lockup
 *   4. Inscribed receipt — flex-fill dotted leaders, reuses S3 inline
 *      editors (RatingGrid / SubStatusPicker / CompletionsCounter / notes
 *      textarea) for editable fields.
 *   5. Bottom cartouche — `HOARD ARCHIVE` / `IN AETERNVM MMXXVI` /
 *      3 sigil row.
 *
 * The 5-stage consecration animation per D7 is wired via CSS classes —
 * each layer has its own animation-delay in `relic-animation.css`. The
 * orchestrator at `useRelicAnimation` toggles the `.relic-animate`
 * parent class on first-visit and clears it once.
 */

import { useState, useEffect, useRef } from 'react';
import type { GameDetailGameInfo, UserGameDetail, SigilAssignment, GameStatus } from '@hoard/types';
import { Btn } from '../../primitives/Btn';
import { Icon } from '../../primitives/Icon';
import { SubStatusPicker } from './SubStatusPicker';
import { CompletionsCounter } from './CompletionsCounter';
import { RatingGrid } from './RatingGrid';
import { SIGIL_BY_NAME } from './relicSigils';
import { api } from '../../../lib/api';

interface Props {
  game: GameDetailGameInfo;
  userGame: UserGameDetail;
  /** Called after any successful PATCH so the parent dispatcher refetches. */
  onMutated: () => void;
  /** Focus the notes editor on mount — used by ?focus=notes deep-link. */
  focusNotes?: boolean;
}

/* ── helpers (port of prototype's fmt + ref + roman) ─────────────── */

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function relicRef(igdbId: number, sealedDate: string): string {
  const h = fnv1a(`${igdbId}:${sealedDate}`);
  const s = h.toString(36).toUpperCase().padStart(8, '0');
  return `${s.slice(0, 3)}-${s.slice(3, 7)}`;
}

function toRoman(n: number): string {
  const map: [number, string][] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let r = '';
  let v = n;
  for (const [k, s] of map) { while (v >= k) { r += s; v -= k; } }
  return r;
}

function fmtPlaytime(min: number | null | undefined): string {
  if (!min || min === 0) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function fmtSealedDate(iso: string): string {
  // ISO date string like "2026-01-22T..." or "2026-01-22"
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10).toUpperCase().replace(/-/g, ' / ');
}

function primaryPlatform(playtimeByPlatform: Record<string, number> | null | undefined): string {
  if (!playtimeByPlatform) return '—';
  let bestKey = '';
  let bestVal = -1;
  for (const [k, v] of Object.entries(playtimeByPlatform)) {
    if (v > bestVal) { bestVal = v; bestKey = k; }
  }
  return bestKey || '—';
}

/* ── micro-barcode (decorative — port of prototype's Code128-ish lib) ── */
const CODE128_START = [2, 1, 1, 4, 1, 2];
const CODE128_STOP  = [2, 3, 3, 1, 1, 1, 2];
const CODE128_CHARS: number[][] = [
  [2, 1, 2, 2, 2, 2], [2, 2, 2, 1, 2, 2], [2, 2, 2, 2, 2, 1], [1, 2, 1, 2, 2, 3],
  [1, 2, 1, 3, 2, 2], [1, 3, 1, 2, 2, 2], [1, 2, 2, 2, 1, 3], [1, 2, 2, 3, 1, 2],
  [1, 3, 2, 2, 1, 2], [2, 2, 1, 2, 1, 3], [2, 2, 1, 3, 1, 2], [2, 3, 1, 2, 1, 2],
];

function microBarcode(refCode: string, totalWidth: number, height: number): string {
  const seed = fnv1a(refCode);
  const charCount = 5 + (seed % 4);
  const seq: number[] = [...CODE128_START];
  let rng = seed;
  for (let i = 0; i < charCount; i++) {
    rng = (rng * 1103515245 + 12345) >>> 0;
    seq.push(...CODE128_CHARS[rng % CODE128_CHARS.length]!);
  }
  seq.push(...CODE128_STOP);
  const totalModules = seq.reduce((s, m) => s + m, 0);
  const moduleW = totalWidth / totalModules;
  let bars = '';
  let x = 0;
  let isBar = true;
  for (const modules of seq) {
    const w = modules * moduleW;
    if (isBar) bars += `<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="${height}" fill="#6b6f72"/>`;
    x += w;
    isBar = !isBar;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${height}" width="${totalWidth}" height="${height}" preserveAspectRatio="none">${bars}</svg>`;
}

/* ── component ───────────────────────────────────────────────────── */

const DOT_FILL = '·'.repeat(200);

export function RelicCard({ game, userGame, onMutated, focusNotes }: Props) {
  const id = userGame.id;
  const sealedIso = userGame.lastPlayedAt ?? userGame.addedAt;
  const completedYear = sealedIso ? new Date(sealedIso).getFullYear() : new Date().getFullYear();
  const ref = relicRef(game.igdbId, sealedIso ?? '');
  const platform = primaryPlatform(userGame.playtimeByPlatform);
  const totalPlaytime = userGame.playtimeByPlatform
    ? Object.values(userGame.playtimeByPlatform).reduce((s: number, v) => s + (v ?? 0), 0)
    : 0;
  // Defensive `?? []` against stale persisted-cache entries from before
  // GD-PR4a added `sigils` to the response. The cache version bump (v4 → v5)
  // should already invalidate, but a half-loaded session or unreloaded API
  // dev server can still produce a sigil-less game. Degrade gracefully —
  // no fallback sigils, just an empty cartouche row.
  const sigils = game.sigils ?? [];
  const primaryGenreCluster = sigils.find((s) => s.dimension === 'GENRE')?.value ?? '—';

  /* ── inline editor state ── */
  const [noteDraft, setNoteDraft] = useState(userGame.notes ?? '');
  const [editingNotes, setEditingNotes] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setNoteDraft(userGame.notes ?? '');
  }, [userGame.notes]);

  useEffect(() => {
    if (focusNotes) {
      setEditingNotes(true);
      // Defer one tick so the textarea is rendered before focus.
      requestAnimationFrame(() => noteRef.current?.focus());
    }
  }, [focusNotes]);

  async function patch<K extends keyof typeof userGame>(field: K, value: typeof userGame[K]) {
    try {
      await api.patchGame(id, { [field]: value } as Parameters<typeof api.patchGame>[1]);
      onMutated();
    } catch (e) {
      console.error('[GD-PR4b] patch failed:', e);
      onMutated(); // refetch reverts the optimistic UI
    }
  }

  async function saveNote() {
    setEditingNotes(false);
    await patch('notes', (noteDraft || null) as UserGameDetail['notes']);
  }

  return (
    <article className="relic-card" data-testid="relic-card">
      {/* Layer 1 — top label band */}
      <div className="relic-band relic-band-top">
        <div className="relic-band-cell" data-stage="band-cell" style={{ ['--cell-i' as string]: 0 }}>
          <span className="relic-k">REF</span>
          <span className="relic-v">{ref}</span>
        </div>
        <div className="relic-band-cell" data-stage="band-cell" style={{ ['--cell-i' as string]: 1 }}>
          <span className="relic-k">BASE MATERIAL</span>
          <span className="relic-v">{primaryGenreCluster}</span>
        </div>
        <div className="relic-band-cell" data-stage="band-cell" style={{ ['--cell-i' as string]: 2 }}>
          <span className="relic-k">SEALED</span>
          <span className="relic-v">{sealedIso ? fmtSealedDate(sealedIso) : '—'}</span>
        </div>
        <div className="relic-band-cell relic-barcode-cell" data-stage="band-cell" style={{ ['--cell-i' as string]: 3 }}>
          <span dangerouslySetInnerHTML={{ __html: microBarcode(ref, 90, 24) }} />
        </div>
      </div>

      {/* Layer 2 — dithered centerpiece (or fallback to cover) */}
      <div className="relic-artwork" data-testid="relic-artwork">
        {game.relicDitherSvg
          ? <div dangerouslySetInnerHTML={{ __html: game.relicDitherSvg }} />
          : game.coverUrl
            ? <img src={game.coverUrl} alt="" />
            : <div className="relic-artwork-empty">// dither pending</div>}
      </div>

      {/* Layer 3 — title + byline */}
      <div className="relic-lockup">
        <div className="relic-title">{game.title.toUpperCase()}</div>
        <div className="relic-byline">
          {(game.developer ?? 'unknown').toLowerCase()}
          {' · '}
          {game.releaseYear ?? '—'}
          {' · '}
          {platform}
        </div>
      </div>

      {/* Layer 4 — inscribed receipt with inline editors */}
      <div className="relic-receipt">
        <div className="relic-rline" style={{ ['--row-i' as string]: 0 }}>
          <span className="relic-k">TOTAL PLAYTIME</span>
          <span className="relic-dots">{DOT_FILL}</span>
          <span className="relic-v">{fmtPlaytime(totalPlaytime)}</span>
        </div>
        <div className="relic-rline" style={{ ['--row-i' as string]: 1 }}>
          <span className="relic-k">SUB-STATUS</span>
          <span className="relic-dots">{DOT_FILL}</span>
          <span className="relic-v">
            <SubStatusPicker
              status={userGame.status as GameStatus}
              subStatus={userGame.subStatus ?? null}
              onChange={(next) => void patch('subStatus', next)}
            />
          </span>
        </div>
        <div className="relic-rline" style={{ ['--row-i' as string]: 2 }}>
          <span className="relic-k">COMPLETIONS</span>
          <span className="relic-dots">{DOT_FILL}</span>
          <span className="relic-v">
            <CompletionsCounter
              status={userGame.status as GameStatus}
              value={userGame.completionsCount ?? 0}
              onChange={(next) => void patch('completionsCount', next)}
            />
          </span>
        </div>
        <div className="relic-rline" style={{ ['--row-i' as string]: 3 }}>
          <span className="relic-k">RATING</span>
          <span className="relic-dots">{DOT_FILL}</span>
          <span className="relic-v">
            <RatingGrid
              value={userGame.rating ?? null}
              onChange={(next) => void patch('rating', next)}
            />
          </span>
        </div>
        <div className="relic-rline relic-rline-note" style={{ ['--row-i' as string]: 4 }}>
          <span className="relic-k">NOTE</span>
          {editingNotes ? (
            <>
              <textarea
                ref={noteRef}
                className="relic-note-input"
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                onBlur={() => void saveNote()}
                aria-label="Note"
                rows={3}
              />
              <Btn sm variant="primary" onClick={() => void saveNote()}>save</Btn>
            </>
          ) : (
            <button
              type="button"
              className="relic-note-display"
              onClick={() => setEditingNotes(true)}
              aria-label="Edit note"
            >
              {userGame.notes
                ? <span className="relic-note-text">{userGame.notes}</span>
                : <span className="relic-note-empty">// tap to inscribe a note</span>}
              <span className="relic-note-edit"><Icon name="plus" size={10} /></span>
            </button>
          )}
        </div>
      </div>

      {/* Layer 5 — bottom cartouche */}
      <div className="relic-band relic-band-bottom">
        <div className="relic-cart-line">
          <span className="relic-cart-rule" />
          <span className="relic-cart-text">HOARD ARCHIVE</span>
          <span className="relic-cart-rule" />
        </div>
        <div className="relic-cart-sub">· IN AETERNVM · {toRoman(completedYear)} ·</div>
        <div className="relic-cart-sigils" aria-label="Sigil stack">
          {sigils.map((a: SigilAssignment, i) => {
            const body = SIGIL_BY_NAME[a.sigilName] ?? '';
            return (
              <span
                key={a.dimension}
                className="relic-sigil"
                style={{ ['--sigil-i' as string]: i }}
                aria-label={`${a.dimension} · ${a.value}`}
              >
                <svg
                  viewBox="0 0 40 40"
                  width="20"
                  height="20"
                  xmlns="http://www.w3.org/2000/svg"
                  dangerouslySetInnerHTML={{ __html: `<title>${a.dimension}: ${a.value}</title>${body}` }}
                />
              </span>
            );
          })}
        </div>
      </div>
    </article>
  );
}
