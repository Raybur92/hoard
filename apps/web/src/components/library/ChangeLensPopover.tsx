import { useEffect, useRef, useState, useCallback } from 'react';
import type { LensType } from '../../hooks/useLensRoute';

/**
 * B-IGDB-3b2 — `[change lens ▾]` chip that pivots the primary lens on
 * filtered views (`/library/Playing` ↔ `/library/by-genre/rpg` etc.).
 *
 * Same WAI-ARIA listbox pattern as `FilterPopover`. Click → opens a
 * popover listing available primary lens types; selection navigates.
 * The CURRENT lens is shown as selected but selectable as a no-op
 * (mostly so the user sees what's active). Lens types disabled when
 * the user has no library data for that dimension.
 */
export interface ChangeLensOption {
  type: LensType;
  label: string;     // "status" / "genre" / "theme" / "perspective"
  disabled?: boolean;
}

export interface ChangeLensPopoverProps {
  current: LensType;
  options: ChangeLensOption[];
  /** Called with the picked lens type (always different from `current`). */
  onPick: (type: LensType) => void;
}

export function ChangeLensPopover({ current, options, onPick }: ChangeLensPopoverProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const currentIdx = Math.max(0, options.findIndex((o) => o.type === current));
  const [activeIdx, setActiveIdx] = useState(currentIdx);

  useEffect(() => {
    if (open) setActiveIdx(currentIdx);
  }, [open, currentIdx]);

  useEffect(() => {
    if (!open) return;
    const onDocPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (popoverRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onDocPointerDown);
    return () => document.removeEventListener('pointerdown', onDocPointerDown);
  }, [open]);

  const closeAndRefocus = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const pick = (i: number) => {
    const opt = options[i];
    if (!opt || opt.disabled || opt.type === current) {
      closeAndRefocus();
      return;
    }
    onPick(opt.type);
    closeAndRefocus();
  };

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  };

  const onPopoverKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); closeAndRefocus(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, options.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); return; }
    if (e.key === 'Home') { e.preventDefault(); setActiveIdx(0); return; }
    if (e.key === 'End') { e.preventDefault(); setActiveIdx(options.length - 1); return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(activeIdx); }
  };

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        ref={triggerRef}
        type="button"
        className="chip"
        onClick={() => setOpen((p) => !p)}
        onKeyDown={onTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Change primary lens"
      >
        <span>change lens</span>
        <span aria-hidden="true" style={{ marginLeft: 2, opacity: 0.6, flexShrink: 0 }}>▾</span>
      </button>
      {open && (
        <div
          ref={(el) => {
            popoverRef.current = el;
            el?.focus();
          }}
          role="listbox"
          aria-label="Primary lens options"
          tabIndex={-1}
          onKeyDown={onPopoverKeyDown}
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            minWidth: 160,
            background: 'var(--ink)',
            border: '1px solid var(--rule)',
            zIndex: 20,
            padding: 4,
            outline: 'none',
            boxShadow: '0 6px 18px rgba(0, 0, 0, 0.4)',
          }}
        >
          {options.map((opt, i) => {
            const selected = opt.type === current;
            const focused = i === activeIdx;
            const handlePick = () => pick(i);
            return (
              <div
                key={opt.type}
                role="option"
                aria-selected={selected}
                aria-disabled={opt.disabled || selected}
                tabIndex={-1}
                data-testid={`change-lens-opt-${opt.type}`}
                onClick={handlePick}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handlePick(); }
                }}
                onMouseEnter={() => setActiveIdx(i)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  padding: '6px 10px',
                  fontFamily: 'var(--mono)',
                  fontSize: 'var(--text-xs)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: opt.disabled
                    ? 'var(--paper-faint)'
                    : selected ? 'var(--paper)' : 'var(--paper-dim)',
                  background: focused && !opt.disabled ? 'var(--ink-2)' : 'transparent',
                  cursor: opt.disabled || selected ? 'default' : 'pointer',
                  userSelect: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                <span>{selected ? '• ' : '  '}{opt.label}</span>
                {selected && <span className="t-faint" style={{ fontSize: 'var(--text-2xs)' }}>active</span>}
                {opt.disabled && <span className="t-faint" style={{ fontSize: 'var(--text-2xs)' }}>—</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
