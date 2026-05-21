import { useNavigate } from 'react-router-dom';
import { Icon } from '../primitives/Icon';
import { Marker } from '../primitives/Marker';
import type { IconName } from '../primitives/Icon';

export type SettingsSection =
  | 'Account'
  | 'Platforms'
  | 'Library'
  | 'Notifications'
  | 'Appearance'
  | 'Privacy'
  | 'Data export'
  | 'Feedback'
  | 'Danger zone';

const SECTION_PATHS: Record<SettingsSection, string> = {
  'Account':      '/settings/account',
  'Platforms':    '/settings/platforms',
  'Library':      '/settings/library',
  'Notifications':'/settings/notifications',
  'Appearance':   '/settings/appearance',
  'Privacy':      '/settings/privacy',
  'Data export':  '/settings/export',
  'Feedback':     '/settings/feedback',
  'Danger zone':  '/settings/danger',
};

const ITEMS: [SettingsSection, IconName][] = [
  ['Account',     'user'],
  ['Platforms',   'link'],
  ['Library',     'menu'],
  ['Notifications','bell'],
  ['Appearance',  'cog'],
  ['Privacy',     'shield'],
  ['Data export', 'download'],
  ['Feedback',    'info'],
  ['Danger zone', 'warn'],
];

export interface SettingsNavProps {
  active: SettingsSection;
}

export function SettingsNav({ active }: SettingsNavProps) {
  const navigate = useNavigate();

  return (
    <nav aria-label="Settings sections" style={{ width: 220, borderRight: '1px solid var(--rule)', padding: '24px 0', background: 'var(--ink)', flexShrink: 0 }}>
      <div style={{ padding: '0 22px 14px' }}>
        <Marker>// settings</Marker>
      </div>
      {ITEMS.map(([label, icon]) => {
        const isActive = active === label;
        const isDanger = label === 'Danger zone';
        return (
          <button
            key={label}
            type="button"
            onClick={() => navigate(SECTION_PATHS[label])}
            aria-current={isActive ? 'page' : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 22px',
              fontSize: 'var(--text-xs)',
              fontFamily: 'var(--mono)',
              color: isDanger
                ? isActive ? 'var(--red)' : 'var(--paper-dim)'
                : isActive ? 'var(--paper)' : 'var(--paper-dim)',
              background: isActive ? 'var(--ink-2)' : 'transparent',
              borderLeft: `2px solid ${isActive ? (isDanger ? 'var(--red)' : 'var(--green)') : 'transparent'}`,
              borderTop: 'none',
              borderRight: 'none',
              borderBottom: 'none',
              cursor: 'pointer',
              width: '100%',
              textAlign: 'left',
            }}
          >
            <Icon name={icon} size={11} />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
