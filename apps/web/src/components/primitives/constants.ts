import type { GameStatus } from '@hoard/types';

export interface StatusConfig {
  dot: string;
  icon: string;
  sigil: string;
  shape: 'sq' | 'di';
}

export const STATUS_CONFIG: Record<GameStatus, StatusConfig> = {
  Playing:   { dot: 'var(--green)',       icon: 'play',   sigil: '[●]', shape: 'sq' },
  Backlog:   { dot: 'var(--paper-faint)', icon: 'circle', sigil: '[ ]', shape: 'sq' },
  Completed: { dot: 'var(--paper)',       icon: 'check',  sigil: '[x]', shape: 'sq' },
  'On Hold': { dot: 'var(--blue)',        icon: 'pause',  sigil: '[~]', shape: 'sq' },
  Dropped:   { dot: 'var(--red)',         icon: 'x',      sigil: '[/]', shape: 'sq' },
  Wishlist:  { dot: 'var(--amber)',       icon: 'star',   sigil: '[?]', shape: 'di' },
};
