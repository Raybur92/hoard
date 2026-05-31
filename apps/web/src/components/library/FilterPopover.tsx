import { useEffect, useRef, useState, useCallback } from 'react';
import type { TagCount } from '../../lib/pickTopTags';

/**
 * Single-select dropdown for Library secondary filters
 * (genre / theme / perspective). Replaces the B-IGDB-3b1 chip strips
 * after Andrea's 2026-05-31 call: chips spread the dimensions across the
 * page; the dropdown collapses them to three compact triggers.
 *
 * Trigger: `[label: value ▾]` chip-styled button. Click opens a popover
 * anchored below it. Single-select: clicking an option applies + closes.
 * "any" entry clears the filter. Escape / click-outside also close.
 *
 * URL state lives on the parent (already wired to `useSearchParams` with
 * `?genre=&theme=&perspective=`); this is a controlled component.
 */
export interface FilterPopoverProps {
  label: string;          // "genre" / "theme" / "persp"
  value: string | null;   // current selection, null = "any"
  options: TagCount[];    // top-N tags with counts (active also threaded in by parent)
  onChange: (next: string | null) => void;
  /** Optional accessible name for the trigger button (defaults to `Filter by ${label}`). */
  triggerAriaLabel?: string;
}

export function FilterPopover({ label, value, options, onChange, triggerAriaLabel }: FilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0); // index into [any, ...options]
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Combine: "any" pseudo-option + top-N tags. Used for both rendering
  // and keyboard navigation (single source of truth).
  const items: { value: string | null; label: string; count: number | null }[] = [
    { value: null, label: 'any', count: null },
    ...options.map((o) => ({ value: o.name, label: o.name, count: o.count })),
  ];
  const activeRowIdx = Math.max(0, items.findIndex((it) => it.value === value));

  // Reset focus index to the currently-selected row whenever the popover opens.
  useEffect(() => {
    if (open) setActiveIdx(activeRowIdx);
  }, [open, activeRowIdx]);

  // Click outside closes. Pointerdown fires before click, so a click on
  // the trigger to toggle re-opens cleanly.
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

  // Escape closes and returns focus to trigger.
  const closeAndRefocus = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  };

  const onPopoverKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeAndRefocus();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, items.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      setActiveIdx(0);
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      setActiveIdx(items.length - 1);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onChange(items[activeIdx]?.value ?? null);
      closeAndRefocus();
    }
  };

  // Trigger renders as a .chip — same height + typography as the
  // surrounding [sort: ...] + platform chips. `on` styling kicks in
  // when a value is selected (not "any").
  const triggerCls = ['chip', value ? 'on' : ''].filter(Boolean).join(' ');
  const valueText = value ?? 'any';

  return (
    // Outer wrapper participates in the parent flex row. `inline-flex` +
    // `min-width: 0` lets the trigger SHRINK before the row wraps to a
    // new line (Andrea 2026-05-31: prefer truncation over wrap). The
    // `max-width: 200px` cap keeps long values like "real time strategy"
    // from blowing the natural width up; if window is wide, the chip
    // stays at its content width and nothing changes.
    <div style={{ position: 'relative', display: 'inline-flex', minWidth: 0, maxWidth: 200 }}>
      <button
        ref={triggerRef}
        type="button"
        className={triggerCls}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={onTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={triggerAriaLabel ?? `Filter by ${label}`}
        style={{ minWidth: 0, maxWidth: '100%' }}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
            display: 'inline-block',
            maxWidth: '100%',
          }}
        >
          {label}: {valueText.toLowerCase()}
        </span>
        <span aria-hidden="true" style={{ marginLeft: 2, opacity: 0.6, flexShrink: 0 }}>▾</span>
      </button>
      {open && (
        <div
          ref={(el) => {
            popoverRef.current = el;
            // Auto-focus on first mount so keyboard nav works
            // immediately after opening via mouse click.
            el?.focus();
          }}
          role="listbox"
          aria-label={`${label} options`}
          tabIndex={-1}
          onKeyDown={onPopoverKeyDown}
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            minWidth: 180,
            maxHeight: 280,
            overflowY: 'auto',
            background: 'var(--ink)',
            border: '1px solid var(--rule)',
            zIndex: 20,
            padding: 4,
            outline: 'none',
            boxShadow: '0 6px 18px rgba(0, 0, 0, 0.4)',
          }}
        >
          {items.map((it, i) => {
            const selected = it.value === value;
            const focused = i === activeIdx;
            const pickItem = () => {
              onChange(it.value);
              closeAndRefocus();
            };
            return (
              <div
                key={it.value ?? '__any'}
                role="option"
                aria-selected={selected}
                tabIndex={-1}
                data-testid={`filter-${label}-opt-${it.label}`}
                onClick={pickItem}
                onKeyDown={(e) => {
                  // The listbox parent owns keyboard nav (Arrow/Home/End/
                  // Escape); per-option Enter/Space here is a redundant
                  // safety net and satisfies the a11y rule for
                  // interactive elements to have keyboard equivalents.
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    pickItem();
                  }
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
                  color: selected ? 'var(--paper)' : 'var(--paper-dim)',
                  background: focused ? 'var(--ink-2)' : 'transparent',
                  cursor: 'pointer',
                  userSelect: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                <span>{selected ? '• ' : '  '}{it.label.toLowerCase()}</span>
                {it.count !== null && (
                  <span className="t-faint" style={{ fontSize: 'var(--text-2xs)' }}>({it.count})</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
