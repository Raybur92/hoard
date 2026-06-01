/**
 * GD-PR3 — sub-status chip + popover picker (OQ-GD-2).
 *
 * Surfaces ONLY the variants valid for the current status. When the
 * status has no variants (Backlog / On Hold / Dropped / Wishlist) the
 * component returns null — the chip is hidden, not greyed out.
 *
 * Click chip → menu opens; click variant → calls onChange + closes.
 * Selecting the currently-active variant clears it (sets to null).
 */

import { useEffect, useRef, useState } from 'react';
import type { GameStatus } from '@hoard/types';

const VARIANTS: Record<GameStatus, readonly string[]> = {
  Playing:   ['infinite', 'paused'] as const,
  Completed: ['main', '+side', '100%'] as const,
  Backlog:   [] as const,
  'On Hold': [] as const,
  Dropped:   [] as const,
  Wishlist:  [] as const,
};

interface Props {
  status: GameStatus;
  subStatus: string | null;
  onChange: (next: string | null) => void;
}

export function SubStatusPicker({ status, subStatus, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const variants = VARIANTS[status];

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (variants.length === 0) return null;

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className="chip"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{ cursor: 'pointer' }}
      >
        sub: {subStatus ?? 'none'} <span className="t-faint" style={{ marginLeft: 4 }}>▾</span>
      </button>
      {open && (
        <ul
          role="listbox"
          tabIndex={-1}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 4,
            background: 'var(--ink-2)',
            border: '1px solid var(--rule-bright)',
            zIndex: 100,
            minWidth: 120,
            padding: '4px 0',
            listStyle: 'none',
            margin: 0,
          }}
        >
          {variants.map((v) => {
            const active = v === subStatus;
            return (
              <li key={v}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(active ? null : v);
                    setOpen(false);
                  }}
                  style={{
                    padding: '6px 14px',
                    fontSize: 'var(--text-2xs)',
                    fontFamily: 'var(--mono)',
                    color: active ? 'var(--paper)' : 'var(--paper-dim)',
                    background: active ? 'var(--ink-3)' : 'transparent',
                    cursor: 'pointer',
                    border: 'none',
                    width: '100%',
                    textAlign: 'left',
                  }}
                >
                  {v}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
