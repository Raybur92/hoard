import { useState, useEffect } from 'react';

export function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const onOnline  = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener('online',  onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online',  onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 9999,
      background: 'var(--amber)',
      color: 'var(--void)',
      fontFamily: 'var(--mono)',
      fontSize: "var(--text-2xs)",
      fontWeight: 500,
      letterSpacing: '0.07em',
      textTransform: 'uppercase',
      padding: '5px 16px',
      textAlign: 'center',
    }}>
      // offline — showing cached data
    </div>
  );
}
