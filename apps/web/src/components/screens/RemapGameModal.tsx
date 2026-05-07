import { useState, useEffect, useRef } from 'react';
import { api, RemapConflictError } from '../../lib/api';
import { Icon } from '../primitives/Icon';
import { Btn } from '../primitives/Btn';
import { Cover } from '../primitives/Cover';
import { Plat } from '../primitives/Plat';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { toPlatCode } from './releases/utils';
import type { IgdbSearchResult, UserGameDetail } from '@hoard/types';

interface Props {
  userGameId: string;
  currentTitle: string;
  currentIgdbId: number;
  onClose: () => void;
  onRemapped: (updated: UserGameDetail) => void;
}

/**
 * Repoint an existing UserGame at a different IGDB game. Used when the
 * sync matcher picked the wrong title — the wrong-sequel case (Slay the
 * Spire 2 instead of Slay the Spire), wrong-series-name collision, or
 * future drift after IGDB merges/rebrands.
 *
 * Same IGDB-search dialog pattern as AddGameModal — kept as a separate
 * component because the action surface is different (no platform / status
 * pickers; "remap" verb instead of "add to library"; explicit current-vs-new
 * preview so the user knows what they're replacing).
 */
export function RemapGameModal({ userGameId, currentTitle, currentIgdbId, onClose, onRemapped }: Props) {
  const [query, setQuery] = useState(currentTitle);
  const [results, setResults] = useState<IgdbSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<IgdbSearchResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // Set when the server returns 409 — the user already has the target Game
  // under another UserGame. The modal swaps the footer for a merge prompt;
  // confirming re-calls remapGame with merge=true.
  const [conflict, setConflict] = useState<{ userGameId: string; title: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trapRef = useFocusTrap<HTMLDivElement>(true);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Debounced IGDB search. Initial query is the current title so the user
  // can immediately see "the right game" if it's just one rank below.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await api.igdbSearch(query);
        setResults(r);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  async function handleConfirm(merge = false) {
    if (!selected) return;
    setSubmitting(true);
    setError('');
    if (!merge) setConflict(null);
    try {
      const updated = await api.remapGame(userGameId, selected.igdbId, merge);
      onRemapped(updated);
      onClose();
    } catch (e) {
      if (e instanceof RemapConflictError) {
        setConflict({ userGameId: e.conflictUserGameId, title: e.conflictTitle });
      } else {
        setError(e instanceof Error ? e.message : 'Failed to remap');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      ref={trapRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="remap-game-title"
      style={{ position: 'fixed', inset: 0, background: 'rgba(7,9,10,0.88)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <button
        type="button"
        aria-label="Close remap dialog"
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'transparent', border: 'none', cursor: 'default' }}
      />
      <div className="panel" style={{ position: 'relative', width: 600, maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 0, border: '1px solid var(--rule-bright)' }}>

        {/* header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 id="remap-game-title" className="t-mono t-up" style={{ fontSize: 'var(--text-3xs)', color: 'var(--paper-dim)', margin: 0, fontWeight: 'normal' }}>
            // remap to the right game
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--paper-dim)', padding: 4, margin: -4 }}
          >
            <Icon name="x" size={11} />
          </button>
        </div>

        {/* current → next preview */}
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--rule)', display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 14 }}>
          <div>
            <div className="t-up t-faint" style={{ fontSize: 'var(--text-3xs)', marginBottom: 4 }}>// currently</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentTitle}
            </div>
            <div className="t-faint" style={{ fontSize: 'var(--text-3xs)', marginTop: 2 }}>igdb #{currentIgdbId}</div>
          </div>
          <Icon name="caret" size={12} style={{ transform: 'rotate(-90deg)', color: 'var(--paper-dim)' }} />
          <div style={{ minWidth: 0 }}>
            <div className="t-up t-faint" style={{ fontSize: 'var(--text-3xs)', marginBottom: 4 }}>// remap to</div>
            <div style={{ fontSize: 'var(--text-xs)', color: selected ? 'var(--amber)' : 'var(--paper-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selected ? selected.title : '(pick from results below)'}
            </div>
            <div className="t-faint" style={{ fontSize: 'var(--text-3xs)', marginTop: 2 }}>
              {selected ? `igdb #${selected.igdbId}` : ' '}
            </div>
          </div>
        </div>

        {/* search */}
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--rule)' }}>
          <label htmlFor="remap-game-search" className="sr-only">Search IGDB by title</label>
          <div className="field" style={{ width: '100%' }}>
            <span className="pre" aria-hidden="true">$</span>
            <input
              id="remap-game-search"
              ref={inputRef}
              value={query}
              onChange={(e) => { setSelected(null); setQuery(e.target.value); }}
              placeholder="search IGDB by title…"
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontFamily: 'var(--mono)', fontSize: 'var(--text-xs)', color: 'var(--paper)' }}
            />
            {searching && <span className="t-faint" style={{ fontSize: 'var(--text-3xs)' }} aria-live="polite">…</span>}
          </div>
        </div>

        {/* results */}
        {results.length > 0 && (
          <ul
            className="thin-scroll"
            role="listbox"
            aria-label="IGDB search results"
            style={{ maxHeight: 320, overflowY: 'auto', borderBottom: '1px solid var(--rule)', listStyle: 'none', margin: 0, padding: 0 }}
          >
            {results.map((r) => {
              const isSelected = selected?.igdbId === r.igdbId;
              const isCurrent  = r.igdbId === currentIgdbId;
              return (
                <li key={r.igdbId} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    onClick={() => setSelected(r)}
                    aria-label={`Select ${r.title}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 18px', cursor: 'pointer',
                      borderBottom: '1px solid var(--rule)', borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                      background: isSelected ? 'var(--ink-2)' : 'transparent',
                      width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit',
                    }}
                    onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--ink-2)'; }}
                    onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <Cover w={32} h={44} label="" src={r.coverUrl} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.title}
                        {isCurrent && (
                          <span className="t-faint" style={{ fontSize: 'var(--text-3xs)', marginLeft: 8 }}>· current</span>
                        )}
                      </div>
                      <div className="t-faint" style={{ fontSize: 'var(--text-3xs)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>{r.developer ?? 'Unknown'}{r.releaseYear ? ` · ${r.releaseYear}` : ''}</span>
                        {r.platforms.length > 0 && (
                          <span style={{ display: 'inline-flex', gap: 3 }}>
                            {r.platforms.slice(0, 4).map((p) => <Plat key={p} code={toPlatCode(p)} />)}
                          </span>
                        )}
                      </div>
                    </div>
                    {isSelected && <Icon name="check" size={11} style={{ color: 'var(--amber)' }} />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {query.length >= 2 && !searching && results.length === 0 && (
          <div style={{ padding: '20px 18px', color: 'var(--paper-dim)', fontSize: 'var(--text-2xs)' }}>
            no results for &quot;{query}&quot;
          </div>
        )}

        {/* footer — swaps to a merge prompt when the server reports a 409 */}
        {conflict ? (
          <div
            role="alertdialog"
            aria-label="Merge into existing entry?"
            style={{ padding: '12px 18px', borderTop: '1px solid var(--rule-bright)', background: 'var(--ink-2)' }}
          >
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--paper)', marginBottom: 4 }}>
              you already have <span style={{ color: 'var(--amber)' }}>{conflict.title}</span> in your library.
            </div>
            <div className="t-faint" style={{ fontSize: 'var(--text-3xs)', marginBottom: 10, lineHeight: 1.5 }}>
              merge will combine playtime (max per platform) and lift this entry's notes / status / rating onto the existing one. this entry will be removed afterward.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Btn sm onClick={() => setConflict(null)}>cancel</Btn>
              <Btn sm variant="amber" onClick={() => void handleConfirm(true)} disabled={submitting}>
                {submitting ? 'merging…' : 'merge into existing'}
              </Btn>
            </div>
          </div>
        ) : (
          <div style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {error
              ? <span style={{ fontSize: 'var(--text-3xs)', color: 'var(--red)' }} role="alert">{error}</span>
              : <span className="t-faint" style={{ fontSize: 'var(--text-3xs)' }}>your notes / status / playtime are preserved.</span>}
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn sm onClick={onClose}>cancel</Btn>
              <Btn sm variant="amber" onClick={() => void handleConfirm()} disabled={!selected || submitting || selected.igdbId === currentIgdbId}>
                {submitting ? 'remapping…' : 'remap'}
              </Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
