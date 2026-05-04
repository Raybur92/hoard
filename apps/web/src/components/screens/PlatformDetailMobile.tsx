import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MobileFrame } from '../layout/MobileFrame';
import { MobileHeader } from '../layout/MobileHeader';
import { MobileTabBar } from '../layout/MobileTabBar';
import { PlatformDot, Toggle } from '../settings';
import type { PlatConnectStatus } from '../settings';
import { Icon } from '../primitives/Icon';
import { Btn } from '../primitives/Btn';
import { Marker } from '../primitives/Marker';
import { api } from '../../lib/api';
import type { PlatformDetail } from '@hoard/types';

const PLATFORM_NAMES: Record<string, string> = {
  st: 'Steam', ps: 'PSN', xb: 'Xbox', gg: 'GOG', nt: 'Nintendo', ep: 'Epic Games',
};

type MobileTab = 'auth' | 'scope' | 'sync' | 'log';

export function PlatformDetailMobile() {
  const { code = '' } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const name = PLATFORM_NAMES[code.toLowerCase()] ?? code.toUpperCase();
  const [activeTab, setActiveTab] = useState<MobileTab>('auth');
  const [platform, setPlatform] = useState<PlatformDetail | null>(null);
  const [npssoInput, setNpssoInput] = useState('');
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    void api.platformStatus().then((r) => {
      const found = r.platforms.find((p) => p.code.toLowerCase() === code.toLowerCase());
      setPlatform(found ?? null);
      if (found?.syncStatus === 'syncing') setSyncing(true);
    }).catch(() => null);
  }, [code]);

  useEffect(() => {
    if (!syncing) return;
    const id = setInterval(() => {
      void api.platformStatus().then((r) => {
        const found = r.platforms.find((p) => p.code.toLowerCase() === code.toLowerCase());
        if (found) {
          setPlatform(found);
          if (found.syncStatus !== 'syncing') setSyncing(false);
        } else {
          setSyncing(false);
        }
      }).catch(() => setSyncing(false));
    }, 2000);
    return () => clearInterval(id);
  }, [syncing, code]);

  function handleSync() {
    setSyncing(true);
    void api.syncPlatform(code.toUpperCase()).catch(() => setSyncing(false));
  }

  const isConnected = !!platform;
  const rawStatus = isConnected ? (syncing ? 'syncing' : platform.syncStatus) : 'available';
  const status: PlatConnectStatus = (rawStatus === 'ok' ? 'connected' : rawStatus) as PlatConnectStatus;

  const noApi = code === 'nt' || code === 'ep';

  return (
    <MobileFrame>
      <MobileHeader
        title={name.toLowerCase()}
        sub={`// ${isConnected ? 'connected' : 'not connected'}`}
        back
      />

      {/* identity strip */}
      <div style={{ padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'center', borderBottom: '1px solid var(--rule)' }}>
        <div style={{ width: 44, height: 44, border: `1px solid ${isConnected ? 'var(--rule-bright)' : 'var(--rule)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="t-display" style={{ fontSize: 18, color: isConnected ? 'var(--paper)' : 'var(--paper-faint)' }}>
            {code.toUpperCase()}
          </span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13 }}>{platform?.who ?? name}</div>
          {isConnected && (
            <div className="t-faint" style={{ fontSize: 10 }}>
              {platform?.gameCount ?? '—'} games · {platform?.lastSyncAt ? relativeTime(platform.lastSyncAt) : 'never synced'}
            </div>
          )}
        </div>
        <PlatformDot status={status} />
      </div>

      {/* manual-only notice */}
      {noApi && (
        <div style={{ padding: '16px 16px 8px' }}>
          <div className="panel" style={{ padding: 14 }}>
            <Marker>// manual only</Marker>
            <div className="t-faint" style={{ fontSize: 12, marginTop: 8, lineHeight: 1.5 }}>
              {name} has no public API. Add games via Library → Add game, using {name} as the platform label.
            </div>
          </div>
        </div>
      )}

      {/* not connected — connect panel */}
      {!isConnected && !noApi && (
        <div style={{ padding: 16 }}>
          {code.toLowerCase() === 'ps' ? (
            <div>
              <div className="t-up t-faint" style={{ fontSize: 9 }}>// npsso token</div>
              <input
                className="field"
                value={npssoInput}
                onChange={(e) => setNpssoInput(e.target.value)}
                placeholder="paste 64-char NPSSO token"
                style={{ width: '100%', marginTop: 8, background: 'var(--ink-2)', border: '1px solid var(--rule-bright)', color: 'var(--paper)', fontFamily: 'var(--mono)', fontSize: 11, padding: '0 12px', height: 36, outline: 'none' }}
                maxLength={64}
              />
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <Btn sm onClick={() => navigate('/settings/platforms/ps/connect')}>
                  guided flow →
                </Btn>
                <Btn sm variant="primary" disabled={npssoInput.length !== 64}
                  onClick={() => void api.connectPsn(npssoInput).then(() => window.location.reload())}>
                  save token
                </Btn>
              </div>
            </div>
          ) : (
            <Btn variant="primary" style={{ width: '100%' }}>
              <Icon name="link" size={11} /> connect {name}
            </Btn>
          )}
        </div>
      )}

      {/* connected: tab strip + content */}
      {isConnected && (
        <>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--rule)', padding: '0 16px' }}>
            {(['auth', 'scope', 'sync', 'log'] as MobileTab[]).map((t) => (
              <div
                key={t}
                onClick={() => setActiveTab(t)}
                style={{
                  padding: '10px 0', marginRight: 18,
                  fontSize: 11, fontFamily: 'var(--mono)',
                  textTransform: 'uppercase', letterSpacing: '0.1em',
                  color: activeTab === t ? 'var(--paper)' : 'var(--paper-faint)',
                  borderBottom: `2px solid ${activeTab === t ? 'var(--green)' : 'transparent'}`,
                  marginBottom: -1,
                  cursor: 'pointer',
                }}
              >
                {t}
              </div>
            ))}
          </div>

          <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '14px 16px' }}>
            {activeTab === 'auth' && (
              <div>
                {code.toLowerCase() === 'ps' ? (
                  <>
                    <div className="t-up t-faint" style={{ fontSize: 9 }}>// active token</div>
                    <div className="field" style={{ marginTop: 8, fontSize: 11 }}>
                      <Icon name="key" size={11} style={{ color: 'var(--amber)' }} />
                      <span style={{ color: 'var(--paper-dim)' }}>NPSSO•••••••••8e2f</span>
                    </div>
                    <div className="t-faint" style={{ fontSize: 10, marginTop: 6 }}>
                      last sync: {platform?.lastSyncAt ? relativeTime(platform.lastSyncAt) : 'never'}
                    </div>
                    <div style={{ marginTop: 16 }}>
                      <Toggle on={true} label="auto-refresh 7d before expiry" />
                    </div>
                  </>
                ) : (
                  <div className="t-faint" style={{ fontSize: 12, lineHeight: 1.5 }}>
                    Connected. Last sync: {platform?.lastSyncAt ? new Date(platform.lastSyncAt).toLocaleDateString() : 'never'}.
                  </div>
                )}
                <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Btn onClick={handleSync} disabled={syncing}>
                    <Icon name="refresh" size={11} /> {syncing ? 'syncing…' : 'sync now'}
                  </Btn>
                  {syncing && <span className="t-faint" style={{ fontSize: 10 }}>importing your library…</span>}
                  <Btn style={{ color: 'var(--red)', borderColor: 'var(--red)' }}
                    onClick={() => void api.disconnectPlatform(code.toUpperCase()).then(() => navigate('/settings/platforms'))}>
                    <Icon name="x" size={11} /> disconnect
                  </Btn>
                </div>
              </div>
            )}
            {activeTab === 'scope' && (
              <div>
                <Marker>// scope</Marker>
                <div className="t-mono" style={{ fontSize: 11, marginTop: 8, color: 'var(--paper-dim)' }}>
                  library · playtime · trophies <span className="t-faint">(friends off)</span>
                </div>
              </div>
            )}
            {activeTab === 'sync' && (
              <div className="t-faint" style={{ fontSize: 12 }}>
                Last sync: {platform?.lastSyncAt ? new Date(platform.lastSyncAt).toLocaleString() : 'never'}.
              </div>
            )}
            {activeTab === 'log' && (
              <pre className="ascii t-faint" style={{ fontSize: 10, lineHeight: 1.7 }}>
                {'// no log entries yet'}
              </pre>
            )}
          </div>
        </>
      )}

      {!isConnected && <div style={{ flex: 1 }} />}
      <MobileTabBar />
    </MobileFrame>
  );
}

function relativeTime(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
