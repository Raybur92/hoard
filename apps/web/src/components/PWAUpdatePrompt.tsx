import { useRegisterSW } from 'virtual:pwa-register/react';

// iOS standalone (home-screen) PWAs don't reliably poll for a new service
// worker, so a fresh deploy can sit unseen until the cache happens to cycle.
// We check explicitly on an interval AND whenever the app returns to the
// foreground — that's what makes a deploy actually reach an installed app
// without the delete-and-re-add dance. The SW is NOT swapped silently
// (registerType:'prompt'); instead the toast below lets the user reload on
// their terms via updateServiceWorker(true) (posts SKIP_WAITING + reloads).
const UPDATE_CHECK_MS = 60_000;

export function PWAUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      const check = () => {
        void registration.update().catch(() => {});
      };
      window.setInterval(check, UPDATE_CHECK_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      window.addEventListener('focus', check);
    },
  });

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        left: '50%',
        transform: 'translateX(-50%)',
        // clear the mobile tab bar (≈56px) + home-indicator inset; on desktop
        // this just floats it above the bottom edge.
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 10px 10px 16px',
        background: 'var(--ink-2)',
        border: '1px solid var(--rule-bright)',
        borderRadius: 8,
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
        maxWidth: 'calc(100vw - 32px)',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 'var(--text-sm)',
          color: 'var(--paper)',
          whiteSpace: 'nowrap',
        }}
      >
        // new version available
      </span>
      <button
        type="button"
        className="btn amber sm"
        onClick={() => void updateServiceWorker(true)}
      >
        reload
      </button>
      <button
        type="button"
        aria-label="Dismiss update notice"
        onClick={() => setNeedRefresh(false)}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--paper-dim)',
          fontFamily: 'var(--mono)',
          fontSize: 'var(--text-md)',
          lineHeight: 1,
          cursor: 'pointer',
          padding: '6px 8px',
        }}
      >
        ×
      </button>
    </div>
  );
}
