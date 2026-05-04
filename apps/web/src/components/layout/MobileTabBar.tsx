import { memo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Icon } from '../primitives/Icon';
import type { IconName } from '../primitives/Icon';

const TABS: { label: string; icon: IconName; path: string }[] = [
  { label: 'Dash',    icon: 'dotO',   path: '/' },
  { label: 'Library', icon: 'menu',   path: '/library' },
  { label: 'Soon',    icon: 'star',   path: '/upcoming' },
  { label: 'Me',      icon: 'circle', path: '/settings' },
];

function MobileTabBarImpl() {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  return (
    <div className="m-tabbar">
      {TABS.map(({ label, icon, path }) => (
        <div
          key={label}
          className={`item${isActive(path) ? ' active' : ''}`}
          onClick={() => navigate(path)}
        >
          <span className="glyph"><Icon name={icon} size={14} /></span>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

export const MobileTabBar = memo(MobileTabBarImpl);
