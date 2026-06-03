import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Btn } from './Btn';
import { Icon } from './Icon';

export interface BackBarProps {
  /** Optional inline content rendered after the back button — e.g. the
   *  `[wrong game?]` remap chip on GameDetailDesktop. Empty by default. */
  children?: ReactNode;
}

/**
 * Standard `[← back]` band shown between TopBar and content on desktop
 * detail screens. Uses `navigate(-1)` so it respects browser history
 * (deep links, multi-step navigation, etc).
 *
 * Visual shape is locked: `12px 36px` padding, `1px var(--rule)` bottom
 * border, `12px` flex gap row. Established across GameDetailDesktop +
 * the GameDetail v2 S1/S2/S4 family + EventDetailDesktop. Don't
 * fork — extend via the `children` slot.
 */
export function BackBar({ children }: BackBarProps) {
  const navigate = useNavigate();
  return (
    <div style={{
      padding: '12px 36px',
      borderBottom: '1px solid var(--rule)',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    }}>
      <Btn sm onClick={() => navigate(-1)}>
        <Icon name="back" size={10} /> back
      </Btn>
      {children}
    </div>
  );
}
