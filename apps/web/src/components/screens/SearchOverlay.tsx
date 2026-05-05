import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { Icon } from '../primitives/Icon';
import { Cover } from '../primitives/Cover';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import type { UserGameDetail } from '@hoard/types';

interface Props {
  onClose: () => void;
}

const STATUS_COLORS: Partial<Record<string, string>> = {
  Playing:   'var(--green)',
  Completed: 'var(--paper)',
  'On Hold': 'var(--blue)',
  Dropped:   'var(--red)',
  Wishlist:  'var(--amber)',
  Backlog:   'var(--paper-faint)',
};

export function SearchOverlay({ onClose }: Props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserGameDetail[]>([]);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trapRef = useFocusTrap<HTMLDivElement>(true);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) { setResults([]); setActive(0); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await api.games({ q: query, limit: 12, sort: 'title' });
        setResults(r.games);
        setActive(0);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  function go(id: string) {
    navigate(`/game/${id}`);
    onClose();
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); return; }
    if (e.key === 'Enter') {
      const hit = results[active];
      if (hit) go(hit.id);
    }
  }

  const hasResults = results.length > 0;
  const noResults  = query.length >= 2 && !searching && !hasResults;

  return (
    <div
      ref={trapRef}
      role="dialog"
      aria-modal="true"
      aria-label="Search games"
      style={{ position: 'fixed', inset: 0, background: 'rgba(7,9,10,0.88)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 100 }}
    >
      {/* keyboard-accessible backdrop close */}
      <button
        type="button"
        aria-label="Close search"
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'transparent', border: 'none', cursor: 'default' }}
      />
      <div
        className="panel"
        style={{ position: 'relative', width: 560, maxHeight: '64vh', display: 'flex', flexDirection: 'column', padding: 0, border: '1px solid var(--rule-bright)', boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}
      >
        {/* input row */}
        <div style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <label htmlFor="search-overlay-input" className="sr-only">Search your library</label>
          <Icon name="search" size={13} style={{ color: 'var(--paper-dim)', flexShrink: 0 }} />
          <input
            id="search-overlay-input"
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="search your library…"
            aria-controls="search-overlay-results"
            aria-activedescendant={hasResults ? `search-result-${active}` : undefined}
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontFamily: 'var(--mono)', fontSize: "var(--text-sm)", color: 'var(--paper)', caretColor: 'var(--green)' }}
          />
          {searching
            ? <span className="t-faint" style={{ fontSize: "var(--text-3xs)", flexShrink: 0 }} aria-live="polite">…</span>
            : <span className="t-mono t-faint" style={{ fontSize: "var(--text-2xs)", flexShrink: 0, letterSpacing: '0.08em' }} aria-hidden="true">ESC</span>
          }
        </div>

        {/* results */}
        {(hasResults || noResults) && <div style={{ height: 1, background: 'var(--rule)' }} />}

        {hasResults && (
          <ul
            id="search-overlay-results"
            role="listbox"
            className="thin-scroll"
            style={{ overflowY: 'auto', listStyle: 'none', margin: 0, padding: 0 }}
          >
            {results.map((g, i) => (
              <li key={g.id} role="presentation">
                <button
                  type="button"
                  id={`search-result-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(g.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '9px 18px',
                    cursor: 'pointer',
                    background: i === active ? 'var(--ink-2)' : 'transparent',
                    borderBottom: i < results.length - 1 ? '1px solid var(--rule)' : 'none',
                    borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                    width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit',
                  }}
                >
                  <Cover w={28} h={38} label="" src={g.game.coverUrl} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "var(--text-xs)", color: 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {g.game.title}
                    </div>
                    {g.game.developer && (
                      <div className="t-faint" style={{ fontSize: "var(--text-3xs)", marginTop: 1 }}>{g.game.developer}</div>
                    )}
                  </div>
                  <span style={{ fontSize: "var(--text-2xs)", color: STATUS_COLORS[g.status] ?? 'var(--paper-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', flexShrink: 0 }}>
                    {g.status}
                  </span>
                  <Icon name="caret" size={9} style={{ color: 'var(--paper-dim)', transform: 'rotate(-90deg)', flexShrink: 0 }} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {noResults && (
          <div style={{ padding: '16px 18px', color: 'var(--paper-dim)', fontSize: "var(--text-2xs)" }} aria-live="polite">
            // no results for &quot;{query}&quot;
          </div>
        )}

        {/* footer */}
        <div style={{ height: 1, background: 'var(--rule)' }} />
        <div style={{ padding: '7px 18px', display: 'flex', gap: 16 }}>
          <span className="t-mono t-faint" style={{ fontSize: "var(--text-2xs)" }}>↑↓ navigate</span>
          <span className="t-mono t-faint" style={{ fontSize: "var(--text-2xs)" }}>↵ open</span>
          <span className="t-mono t-faint" style={{ fontSize: "var(--text-2xs)" }}>esc close</span>
        </div>
      </div>
    </div>
  );
}
