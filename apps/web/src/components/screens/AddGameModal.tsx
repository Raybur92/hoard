import { useState, useEffect, useRef } from 'react';
import { api } from '../../lib/api';
import { Icon } from '../primitives/Icon';
import { Btn } from '../primitives/Btn';
import { Cover } from '../primitives/Cover';
import type { IgdbSearchResult, GameStatus } from '@hoard/types';

const STATUSES: GameStatus[] = ['Playing', 'Backlog', 'Completed', 'On Hold', 'Dropped', 'Wishlist'];

const PLATFORM_OPTIONS = [
  { label: 'Nintendo', value: 'Nintendo' },
  { label: 'Epic Games', value: 'Epic' },
  { label: 'PC (other)', value: 'PC' },
  { label: 'Other', value: 'Other' },
];

interface Props {
  onClose: () => void;
  onAdded: () => void;
}

export function AddGameModal({ onClose, onAdded }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<IgdbSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<IgdbSearchResult | null>(null);
  const [platform, setPlatform] = useState('Nintendo');
  const [status, setStatus] = useState<GameStatus>('Backlog');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

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
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  async function handleAdd() {
    if (!selected) return;
    setAdding(true);
    setError('');
    try {
      await api.addManualGame({
        igdbId: selected.igdbId,
        title: selected.title,
        ...(selected.developer ? { developer: selected.developer } : {}),
        ...(selected.coverUrl ? { coverUrl: selected.coverUrl } : {}),
        platformLabel: platform,
        status,
      });
      onAdded();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add game');
    } finally {
      setAdding(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-game-title"
      style={{ position: 'fixed', inset: 0, background: 'rgba(7,9,10,0.88)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      {/* backdrop captures clicks outside the panel; uses a button for keyboard a11y */}
      <button
        type="button"
        aria-label="Close add-game dialog"
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'transparent', border: 'none', cursor: 'default' }}
      />
      <div className="panel" style={{ position: 'relative', width: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: 0, border: '1px solid var(--rule-bright)' }}>
        {/* header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 id="add-game-title" className="t-mono t-up" style={{ fontSize: "var(--text-3xs)", color: 'var(--paper-dim)', margin: 0, fontWeight: 'normal' }}>// add game</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--paper-dim)', padding: 4, margin: -4 }}
          >
            <Icon name="x" size={11} />
          </button>
        </div>

        {/* search */}
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--rule)' }}>
          <label htmlFor="add-game-search" className="sr-only">Search IGDB by title</label>
          <div className="field" style={{ width: '100%' }}>
            <span className="pre" aria-hidden="true">$</span>
            <input
              id="add-game-search"
              ref={inputRef}
              value={query}
              onChange={(e) => { setSelected(null); setQuery(e.target.value); }}
              placeholder="search IGDB by title…"
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontFamily: 'var(--mono)', fontSize: "var(--text-xs)", color: 'var(--paper)' }}
            />
            {searching && <span className="t-faint" style={{ fontSize: "var(--text-3xs)" }} aria-live="polite">…</span>}
          </div>
        </div>

        {/* results */}
        {!selected && results.length > 0 && (
          <ul className="thin-scroll" role="listbox" aria-label="Search results" style={{ maxHeight: 260, overflowY: 'auto', borderBottom: '1px solid var(--rule)', listStyle: 'none', margin: 0, padding: 0 }}>
            {results.map((r) => (
              <li key={r.igdbId} role="option" aria-selected={false}>
                <button
                  type="button"
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
                    <div style={{ fontSize: "var(--text-xs)", color: 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                    <div className="t-faint" style={{ fontSize: "var(--text-3xs)", marginTop: 2 }}>
                      {r.developer ?? 'Unknown'}{r.releaseYear ? ` · ${r.releaseYear}` : ''}
                    </div>
                  </div>
                  <Icon name="caret" size={10} style={{ transform: 'rotate(-90deg)', color: 'var(--paper-dim)' }} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {!selected && query.length >= 2 && !searching && results.length === 0 && (
          <div style={{ padding: '20px 18px', color: 'var(--paper-dim)', fontSize: "var(--text-2xs)" }}>
            no results for &quot;{query}&quot;
          </div>
        )}

        {/* selected game + options */}
        {selected && (
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--rule)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <Cover w={36} h={50} label="" src={selected.coverUrl} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "var(--text-sm)", color: 'var(--paper)' }}>{selected.title}</div>
                <div className="t-faint" style={{ fontSize: "var(--text-3xs)", marginTop: 2 }}>
                  {selected.developer ?? 'Unknown'}{selected.releaseYear ? ` · ${selected.releaseYear}` : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                style={{
                  background: 'transparent', border: 'none', padding: '4px 6px',
                  cursor: 'pointer', fontSize: "var(--text-3xs)", color: 'var(--paper-dim)',
                  fontFamily: 'inherit',
                }}
              >
                change
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label htmlFor="add-game-platform" className="t-up t-faint" style={{ fontSize: "var(--text-2xs)", marginBottom: 6, display: 'block' }}>// platform</label>
                <select
                  id="add-game-platform"
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  style={{ width: '100%', background: 'var(--ink-2)', border: '1px solid var(--rule-bright)', color: 'var(--paper)', fontFamily: 'var(--mono)', fontSize: "var(--text-2xs)", padding: '5px 8px' }}
                >
                  {PLATFORM_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="add-game-status" className="t-up t-faint" style={{ fontSize: "var(--text-2xs)", marginBottom: 6, display: 'block' }}>// status</label>
                <select
                  id="add-game-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as GameStatus)}
                  style={{ width: '100%', background: 'var(--ink-2)', border: '1px solid var(--rule-bright)', color: 'var(--paper)', fontFamily: 'var(--mono)', fontSize: "var(--text-2xs)", padding: '5px 8px' }}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* footer */}
        <div style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {error ? <span style={{ fontSize: "var(--text-3xs)", color: 'var(--red)' }}>{error}</span> : <span />}
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn sm onClick={onClose}>cancel</Btn>
            <Btn sm variant="primary" onClick={() => void handleAdd()} disabled={!selected || adding}>
              {adding ? 'adding…' : '+ add to library'}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
