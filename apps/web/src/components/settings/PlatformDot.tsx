import { Icon } from '../primitives/Icon';

export type PlatConnectStatus = 'connected' | 'stale' | 'error' | 'available' | 'unsupported' | 'syncing';

const STATUS_MAP: Record<PlatConnectStatus | 'ok', [string, string]> = {
  ok:          ['var(--green)',       'connected'],
  connected:   ['var(--green)',       'connected'],
  stale:       ['var(--amber)',       'stale'],
  error:       ['var(--red)',         'error'],
  available:   ['var(--paper-faint)', 'not connected'],
  unsupported: ['var(--paper-faint)', 'manual only'],
  syncing:     ['var(--green)',       'syncing'],
};

export interface PlatformDotProps {
  status: PlatConnectStatus;
}

export function PlatformDot({ status }: PlatformDotProps) {
  const [color, label] = STATUS_MAP[status as PlatConnectStatus | 'ok'] ?? STATUS_MAP.available;
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 10,
      color,
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
    }}>
      <Icon name="dotO" size={7} fill={true} /> {label}
    </span>
  );
}
