// F1-PR1 manual-add-a-game modal — status-first layout + IGDB-aware
// two-stage platform picker + entry-intent threading + P5 post-success
// pattern (b) + platform pinning across [+ add another].
//
// Layered design references:
// - INTERACTION_FLOW.md F1 (places P1, P2, P5 — P3 freeform + P4 camera
//   deferred to F1-PR4 / B6k/B6l)
// - SURFACE.md §2 (PLATFORMS section visual — not this surface, but the
//   PLATFORMS section appears elsewhere) + §3 (status-first P2) + §6
//   (P5 pattern b) + §7 (platform pin)
//
// NOT in F1-PR1 (deferred to subsequent PRs):
// - mediaType picker (R1 schema gap — PR2)
// - condition + region pickers (R3 — PR2)
// - [+ more details] panel with manual playtime (PR3)
// - Freeform-fallback P3 (PR4)
// - Backend silent-merge upsert + status-conflict matrix (PR5)
// - "you got it!" copy variant (PR6)

import { useState, useEffect, useRef } from 'react';
import { api } from '../../lib/api';
import { Icon } from '../primitives/Icon';
import { Btn } from '../primitives/Btn';
import { Cover } from '../primitives/Cover';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { PlatformPicker } from './PlatformPicker';
import { pushRecent } from '../../lib/recentPlatforms';
import type { IgdbSearchResult, GameStatus } from '@hoard/types';

const STATUSES: GameStatus[] = ['Playing', 'Backlog', 'Completed', 'On Hold', 'Dropped', 'Wishlist'];

/** Map a GameStatus to its visual treatment when active in the chip strip. */
const STATUS_ACTIVE_COLOR: Record<GameStatus, { bg: string; fg: string; border: string }> = {
  Playing:    { bg: 'var(--green)',     fg: 'var(--void)',  border: 'var(--green)' },
  Backlog:    { bg: 'var(--paper-dim)', fg: 'var(--void)',  border: 'var(--paper-dim)' },
  Completed:  { bg: 'var(--paper)',     fg: 'var(--void)',  border: 'var(--paper)' },
  'On Hold':  { bg: 'var(--blue)',      fg: 'var(--void)',  border: 'var(--blue)' },
  Dropped:    { bg: 'var(--red)',       fg: 'var(--void)',  border: 'var(--red)' },
  Wishlist:   { bg: 'var(--amber)',     fg: 'var(--void)',  border: 'var(--amber)' },
};

export interface AddGameModalProps {
  onClose: () => void;
  onAdded: () => void;
  /** Entry intent. 'own' → default status = Backlog; 'wishlist' → default status = Wishlist. */
  intent?: 'own' | 'wishlist';
}

interface SuccessPayload {
  userGameId: string | null;
  title: string;
  platform: string;
  status: GameStatus;
  intent: 'own' | 'wishlist';
}

// 15s gives the user time to read the summary + decide between
// [+ add another] (bulk-add affordance — the S7 use case) or [done].
// Bumped 3s → 10s → 15s across smoke tests 2026-05-22; 15s landed
// because the user wanted breathing room to also internalize what
// platform got pinned for the next add. The auto-close progress bar
// still drains visually; users who don't want to wait can hit [done]
// or click outside / Esc to close immediately.
const AUTO_CLOSE_MS = 15000;

export function AddGameModal({ onClose, onAdded, intent = 'own' }: AddGameModalProps) {
  // Search
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<IgdbSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  // Selection
  const [selected, setSelected] = useState<IgdbSearchResult | null>(null);
  // Form
  const [platform, setPlatform] = useState<string | null>(null);
  const [status, setStatus] = useState<GameStatus>(intent === 'wishlist' ? 'Wishlist' : 'Backlog');
  // Save
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  // Post-success state (pattern b — P5)
  const [successPayload, setSuccessPayload] = useState<SuccessPayload | null>(null);
  const [progressWidth, setProgressWidth] = useState(100);
  // Pinned platform for [+ add another]
  const [pinnedPlatform, setPinnedPlatform] = useState<string | null>(null);
  // Entry intent persists across [+ add another]. Currently a constant
  // because no flow within the modal changes it — kept as a separate
  // name from `intent` (the prop) so future paths that might toggle it
  // can land cleanly.
  const activeIntent: 'own' | 'wishlist' = intent;

  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trapRef = useFocusTrap<HTMLDivElement>(true);

  // Focus search input on mount + on Escape close.
  useEffect(() => {
    searchInputRef.current?.focus();
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Debounced IGDB search.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) { setResults([]); setSearchError(null); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const r = await api.igdbSearch(query);
        setResults(r);
      } catch {
        setResults([]);
        setSearchError('IGDB unreachable — try again');
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // Auto-close timer + progress bar drain on post-success.
  // NOTE: hover-pause described in SURFACE.md §6.4 is deferred — PR1
  // ships the simple 3s timer; pause-on-hover lands in a follow-up
  // polish pass.
  useEffect(() => {
    if (!successPayload) {
      setProgressWidth(100);
      return;
    }
    // Kick the CSS transition: schedule the width change in the next
    // animation frame so the transition fires from 100 → 0.
    const raf = requestAnimationFrame(() => setProgressWidth(0));
    closeTimerRef.current = setTimeout(() => onClose(), AUTO_CLOSE_MS);
    return () => {
      cancelAnimationFrame(raf);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, [successPayload, onClose]);

  // When user picks a platform, prefill from pinned if available.
  useEffect(() => {
    if (pinnedPlatform && !platform) {
      setPlatform(pinnedPlatform);
    }
  }, [pinnedPlatform, platform]);

  async function handleSave(): Promise<void> {
    if (!selected || !platform) return;
    setAdding(true);
    setAddError(null);
    try {
      await api.addManualGame({
        igdbId: selected.igdbId,
        title: selected.title,
        ...(selected.developer ? { developer: selected.developer } : {}),
        ...(selected.coverUrl ? { coverUrl: selected.coverUrl } : {}),
        platformLabel: platform,
        status,
      });
      pushRecent(platform);
      onAdded();
      setSuccessPayload({
        userGameId: null, // backend doesn't currently return the userGameId from addManualGame; refetch covers display
        title: selected.title,
        platform,
        status,
        intent: activeIntent,
      });
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Failed to add game');
    } finally {
      setAdding(false);
    }
  }

  function handleAddAnother(): void {
    // Reset search/select state but preserve the platform pin + intent for bulk-add.
    if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
    setPinnedPlatform(platform);
    setSuccessPayload(null);
    setQuery('');
    setResults([]);
    setSelected(null);
    setStatus(activeIntent === 'wishlist' ? 'Wishlist' : 'Backlog');
    setAddError(null);
    // platform stays — pinnedPlatform effect re-prefills it
    setPlatform(platform);
    // refocus the search input
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  }

  function handleUnpin(): void {
    setPinnedPlatform(null);
    setPlatform(null);
  }

  // ── render ──

  if (successPayload) {
    return <ModalShell trapRef={trapRef} onClose={onClose}>
      <SuccessBody
        payload={successPayload}
        progressWidth={progressWidth}
        onDone={onClose}
        onAddAnother={handleAddAnother}
      />
    </ModalShell>;
  }

  const canSave = !!selected && !!platform && !adding;
  const saveCtaLabel = activeIntent === 'wishlist' ? '+ add to wishlist' : '+ add to library';
  const igdbPlatforms = selected?.platforms ?? [];

  return (
    <ModalShell trapRef={trapRef} onClose={onClose}>
      {/* Pinned-platform indicator (above search field, only on P1 empty / before selection) */}
      {pinnedPlatform && !selected && (
        <div style={{ padding: '8px 18px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="t-mono t-faint" style={{ fontSize: 'var(--text-2xs)' }}>// pinned: {pinnedPlatform}</span>
          <button
            type="button"
            onClick={handleUnpin}
            className="t-mono"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--paper-dim)',
              fontSize: 'var(--text-3xs)',
              cursor: 'pointer',
              padding: 0,
            }}
            aria-label="Unpin platform"
          >
            [× unpin]
          </button>
        </div>
      )}

      {/* P1 — Search field */}
      <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--rule)' }}>
        <label htmlFor="add-game-search" className="sr-only">Search IGDB by title</label>
        <div className="field" style={{ width: '100%' }}>
          <span className="pre" aria-hidden="true">$</span>
          <input
            id="add-game-search"
            ref={searchInputRef}
            value={query}
            onChange={(e) => { setSelected(null); setQuery(e.target.value); }}
            placeholder="search IGDB by title…"
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontFamily: 'var(--mono)', fontSize: 'var(--text-xs)', color: 'var(--paper)' }}
          />
          {searching && <span className="t-faint" style={{ fontSize: 'var(--text-3xs)' }} aria-live="polite">…</span>}
        </div>
      </div>

      {/* P1 — Results list (when no selection) */}
      {!selected && results.length > 0 && (
        <ul className="thin-scroll" role="listbox" aria-label="Search results" style={{ maxHeight: 260, overflowY: 'auto', borderBottom: '1px solid var(--rule)', listStyle: 'none', margin: 0, padding: 0 }}>
          {results.map((r) => (
            <li key={r.igdbId}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => setSelected(r)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 18px', cursor: 'pointer',
                  borderBottom: '1px solid var(--rule)', borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                  background: 'transparent',
                  width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--ink-2)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <Cover w={32} h={44} label="" src={r.coverUrl} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                  <div className="t-faint" style={{ fontSize: 'var(--text-3xs)', marginTop: 2 }}>
                    {r.developer ?? 'Unknown'}{r.releaseYear ? ` · ${r.releaseYear}` : ''}
                  </div>
                </div>
                <Icon name="caret" size={10} style={{ transform: 'rotate(-90deg)', color: 'var(--paper-dim)' }} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* P1 — No-results / search-error */}
      {!selected && query.length >= 2 && !searching && results.length === 0 && (
        <div style={{ padding: '20px 18px', color: 'var(--paper-dim)', fontSize: 'var(--text-2xs)' }}>
          {searchError ? (
            <>
              <div className="t-mono t-red" style={{ marginBottom: 8 }}>// {searchError}</div>
              <div className="t-mono t-faint">freeform-fallback (P3) ships in F1-PR4</div>
            </>
          ) : (
            <>no results for &quot;{query}&quot; — freeform-fallback (P3) ships in F1-PR4</>
          )}
        </div>
      )}

      {/* P2 — Selected game + confirm details */}
      {selected && (
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--rule)' }}>
          {/* Status chip strip — PRIMARY visual question */}
          <div style={{ marginBottom: 14 }}>
            <div className="t-mono t-faint" style={{ fontSize: 'var(--text-2xs)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>// status</div>
            <div role="radiogroup" aria-label="Status" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {STATUSES.map((s) => {
                const active = s === status;
                const color = STATUS_ACTIVE_COLOR[s];
                return (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setStatus(s)}
                    className="chip"
                    style={{
                      cursor: 'pointer',
                      ...(active ? {
                        background: color.bg,
                        color: color.fg,
                        borderColor: color.border,
                      } : {}),
                    }}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Game summary card */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <Cover w={36} h={50} label="" src={selected.coverUrl} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--paper)' }}>{selected.title}</div>
              <div className="t-faint" style={{ fontSize: 'var(--text-3xs)', marginTop: 2 }}>
                {selected.developer ?? 'Unknown'}{selected.releaseYear ? ` · ${selected.releaseYear}` : ''}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              style={{
                background: 'transparent', border: 'none', padding: '4px 6px',
                cursor: 'pointer', fontSize: 'var(--text-3xs)', color: 'var(--paper-dim)',
                fontFamily: 'inherit',
              }}
              aria-label="Pick a different game"
            >
              [pick different]
            </button>
          </div>

          {/* Platform picker (secondary) */}
          <div>
            <div className="t-mono t-faint" style={{ fontSize: 'var(--text-2xs)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>// platform</div>
            <PlatformPicker
              value={platform}
              onChange={setPlatform}
              igdbPlatforms={igdbPlatforms}
              disabled={adding}
            />
          </div>
        </div>
      )}

      {/* Footer — save / cancel */}
      <div style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {addError ? <span style={{ fontSize: 'var(--text-3xs)', color: 'var(--red)' }}>{addError}</span> : <span />}
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn sm onClick={onClose}>cancel</Btn>
          <Btn sm variant="primary" onClick={() => void handleSave()} disabled={!canSave}>
            {adding ? 'adding…' : saveCtaLabel}
          </Btn>
        </div>
      </div>
    </ModalShell>
  );
}

// ── Modal shell ──

function ModalShell({ trapRef, onClose, children }: { trapRef: React.RefObject<HTMLDivElement | null>; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      ref={trapRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-game-title"
      style={{ position: 'fixed', inset: 0, background: 'rgba(7,9,10,0.88)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <button
        type="button"
        aria-label="Close add-game dialog"
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'transparent', border: 'none', cursor: 'default' }}
      />
      <div className="panel" style={{ position: 'relative', width: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: 0, border: '1px solid var(--rule-bright)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 id="add-game-title" className="t-mono t-up" style={{ fontSize: 'var(--text-3xs)', color: 'var(--paper-dim)', margin: 0, fontWeight: 'normal' }}>// add game</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--paper-dim)', padding: 4, margin: -4 }}
          >
            <Icon name="x" size={11} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── P5 post-success body (pattern b) ──

function SuccessBody({ payload, progressWidth, onDone, onAddAnother }: {
  payload: SuccessPayload;
  progressWidth: number;
  onDone: () => void;
  onAddAnother: () => void;
}) {
  const summaryVerb = payload.intent === 'wishlist' ? 'added to wishlist' : 'added';
  return (
    <>
      <div style={{ padding: '40px 24px 28px 24px', textAlign: 'center' }}>
        <div className="t-mono" style={{ fontSize: 'var(--text-sm)', color: 'var(--paper)' }}>
          <span style={{ color: 'var(--green)' }}>// {summaryVerb}</span>
          {' · '}{payload.title}
          {' · '}<span className="t-faint">{payload.platform}</span>
          {payload.intent === 'own' && (
            <>{' · '}<span className="t-faint">{payload.status}</span></>
          )}
        </div>
        {/*
          [view game] + [+ rate / note] deep-links live here in F1-PR6 — both
          need the userGameId from addManualGame's response (which the route
          doesn't currently return). Rendering them as disabled placeholders
          in F1-PR1 read as broken UI per Andrea's smoke test 2026-05-22, so
          they're omitted until they can actually do something.
        */}
      </div>

      <div style={{ padding: '12px 18px', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--rule)' }}>
        <Btn sm onClick={onAddAnother}>+ add another</Btn>
        <Btn sm variant="primary" onClick={onDone}>done</Btn>
      </div>

      {/* Auto-close progress bar — 2px green at the very bottom */}
      <div aria-hidden="true" style={{
        height: 2,
        background: 'var(--green)',
        width: `${progressWidth}%`,
        transition: `width ${AUTO_CLOSE_MS}ms linear`,
      }} />
    </>
  );
}
