/**
 * GD-PR3 — times-beaten counter (OQ-GD-3).
 *
 * Renders as `[×N − +]` — current count with `−` and `+` buttons.
 * Hidden entirely when value is null AND status isn't Completed (no
 * point surfacing "× 0" on a Backlog game). Visible on any Completed
 * game even when count is 0, so the user can register their first
 * completion.
 *
 * Defensive caps: never decrement below 0; never increment above 99
 * (the API caps at 999 but anything beyond ~3 is already exotic).
 */

import type { GameStatus } from '@hoard/types';
import { Btn } from '../../primitives/Btn';

interface Props {
  status: GameStatus;
  value: number | null;
  onChange: (next: number) => void;
}

export function CompletionsCounter({ status, value, onChange }: Props) {
  const isCompleted = status === 'Completed';
  const count = value ?? 0;

  // Skip entirely on non-Completed games unless the user already has a
  // non-zero count (e.g. game later moved to Dropped after one run).
  if (!isCompleted && count === 0) return null;

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span className="t-mono t-faint" style={{ fontSize: 'var(--text-2xs)' }}>beaten</span>
      <Btn
        sm
        onClick={() => onChange(Math.max(0, count - 1))}
        disabled={count === 0}
        ariaLabel="Decrement times beaten"
      >
        −
      </Btn>
      <span
        className="t-mono t-tnum"
        style={{ fontSize: 'var(--text-sm)', minWidth: 24, textAlign: 'center', color: count > 0 ? 'var(--paper)' : 'var(--paper-dim)' }}
      >
        ×{count}
      </span>
      <Btn
        sm
        onClick={() => onChange(Math.min(99, count + 1))}
        ariaLabel="Increment times beaten"
      >
        +
      </Btn>
    </div>
  );
}
