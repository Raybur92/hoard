import type { GameStatus } from '@hoard/types';
import { STATUS_CONFIG } from './constants';

export interface StatusSigilProps {
  status: GameStatus;
  label?: boolean;
}

export function StatusSigil({ status, label = true }: StatusSigilProps) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.Backlog;
  return (
    <span className="status-sigil">
      <span className={`dot ${cfg.shape}`} style={{ background: cfg.dot }} />
      {label && <span>{status}</span>}
    </span>
  );
}
