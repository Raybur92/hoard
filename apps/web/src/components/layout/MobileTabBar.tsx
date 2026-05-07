import { memo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Icon } from '../primitives/Icon';
import type { IconName } from '../primitives/Icon';

const TABS: { label: string; icon: IconName; path: string }[] = [
  { label: 'Dash',    icon: 'home',  path: '/' },
  { label: 'Library', icon: 'rows',  path: '/library' },
  { label: 'Soon',    icon: 'clock', path: '/releases' },
  { label: 'Me',      icon: 'user',  path: '/settings' },
];

function MobileTabBarImpl() {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  const handleTap = (path: string) => {
    navigator.vibrate?.(8);
    navigate(path);
  };

  return (
    <nav className="m-tabbar" aria-label="primary">
      {TABS.map(({ label, icon, path }) => (
        <button
          key={label}
          type="button"
          className={`item${isActive(path) ? ' active' : ''}`}
          onClick={() => handleTap(path)}
          aria-current={isActive(path) ? 'page' : undefined}
        >
          <span className="glyph"><Icon name={icon} size={18} /></span>
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

export const MobileTabBar = memo(MobileTabBarImpl);
