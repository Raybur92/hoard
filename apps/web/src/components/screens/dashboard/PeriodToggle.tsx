import type { DashboardPeriod } from '@hoard/types';

export interface PeriodToggleProps {
  value: DashboardPeriod;
  onChange: (next: DashboardPeriod) => void;
  /** Compact variant (smaller padding) for inline placement inside bento
   *  card headers. Mobile uses the same component. */
  compact?: boolean;
}

const OPTIONS: { value: DashboardPeriod; label: string; ariaLabel: string }[] = [
  { value: 'year', label: 'this year', ariaLabel: 'Scope to this year' },
  { value: 'month', label: 'this month', ariaLabel: 'Scope to this month' },
  { value: 'all', label: 'all time', ariaLabel: 'Show all time' },
];

/**
 * DASH-PR2 — three-state time-axis toggle bound to a single `DashboardPeriod`.
 * Mounts inside the combined `card-progress` (post-iteration); a single
 * instance drives both completion + achievements halves.
 *
 * Active chip uses the `.chip.solid.amber` design-system pattern (amber
 * background, void text) so the selection state is unmistakeable — Andrea's
 * feedback after the first pass was that the previous subtle ink-2 styling
 * felt broken because the change wasn't immediately visible on click.
 *
 * Active chip stays clickable (no `cursor: default`) so the user can re-tap
 * to confirm intent — feels less brittle than a hard "this is locked" state.
 * On mobile, a short haptic tick fires on every state change.
 */
export function PeriodToggle({ value, onChange, compact = false }: PeriodToggleProps) {
  function handleClick(next: DashboardPeriod) {
    if (next === value) return;
    // Mobile haptic. Safe on desktop — vibrate is a no-op without hardware.
    navigator.vibrate?.(8);
    onChange(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label="Time period"
      style={{ display: 'inline-flex', gap: compact ? 4 : 6 }}
    >
      {OPTIONS.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={opt.ariaLabel}
            onClick={() => handleClick(opt.value)}
            className={active ? 'chip solid amber' : 'chip'}
            style={{
              // Override default chip height (28px is too tall for an inline
              // bento card header); keep the rest of the .chip styling.
              height: compact ? 22 : 26,
              padding: compact ? '0 8px' : '0 10px',
              fontSize: 'var(--text-3xs)',
              letterSpacing: '0.04em',
              fontWeight: active ? 500 : 400,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
