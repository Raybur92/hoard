/**
 * GD-PR3 — 10-box click-to-fill rating grid (OQ-GD-4).
 *
 * Matches the terminal aesthetic better than stars or a slider — small
 * square boxes filled in amber as the user clicks. Hover preview shows
 * what the value would be on commit. Click on the currently-filled value
 * clears the rating; click any other box sets to that index+1.
 *
 * Renders inline (no modal). Caller passes `value` + `onChange` and
 * handles the api.patchGame call itself so it can pair with notes /
 * status optimistic updates.
 */

import { useState } from 'react';

interface Props {
  value: number | null;
  /** Receives the new value (1-10) or null when cleared. */
  onChange: (next: number | null) => void;
  /** Read-only mode — used by the GameDetailMobile receipt block where
   *  the rating is rendered for reference but editing happens inline. */
  readonly?: boolean;
}

const boxStyle = (filled: boolean, hovered: boolean): React.CSSProperties => ({
  width: 22,
  height: 22,
  background: filled
    ? 'var(--amber)'
    : hovered
      ? 'var(--amber-dim, rgba(212, 160, 23, 0.3))'
      : 'transparent',
  border: `1px solid ${filled ? 'var(--amber)' : 'var(--rule)'}`,
  cursor: 'pointer',
  padding: 0,
  display: 'block',
  transition: 'background 80ms linear',
});

export function RatingGrid({ value, onChange, readonly }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const preview = hover ?? value ?? 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div
        role="radiogroup"
        aria-label="Rating out of 10"
        // Each option is its own focusable target; the wrapper holds the
        // group label only, so `tabIndex={-1}` keeps the radiogroup itself
        // out of the tab order while still satisfying the
        // interactive-supports-focus rule.
        tabIndex={-1}
        style={{ display: 'flex', gap: 4 }}
        onMouseLeave={() => setHover(null)}
      >
        {Array.from({ length: 10 }, (_, i) => {
          const slot = i + 1;
          const filled = slot <= preview;
          if (readonly) {
            return (
              <span
                key={slot}
                role="radio"
                aria-checked={value === slot}
                aria-label={`${slot} of 10`}
                style={{ ...boxStyle(filled, false), cursor: 'default' }}
              />
            );
          }
          return (
            <button
              key={slot}
              type="button"
              role="radio"
              aria-checked={value === slot}
              aria-label={`Rate ${slot} of 10`}
              onMouseEnter={() => setHover(slot)}
              onClick={() => onChange(value === slot ? null : slot)}
              style={boxStyle(filled, false)}
            />
          );
        })}
      </div>
      <span className="t-mono t-faint" style={{ fontSize: 'var(--text-xs)', minWidth: 36 }}>
        {value !== null ? `${value}/10` : (hover !== null ? `${hover}/10?` : 'unrated')}
      </span>
    </div>
  );
}
