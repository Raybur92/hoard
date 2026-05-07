import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { MobileHeader } from '../layout/MobileHeader';
import { PlatformDot, Toggle, Radio } from '../settings';
import type { PlatConnectStatus } from '../settings';
import { Icon } from '../primitives/Icon';
import { Btn } from '../primitives/Btn';
import { Marker } from '../primitives/Marker';
import { api } from '../../lib/api';
import type { PlatformDetail, SyncFrequency } from '@hoard/types';

const API_BASE = (import.meta.env['VITE_API_URL'] as string | undefined) ?? '';

const PLATFORM_CONNECT_PATH: Record<string, string | null> = {
  st: '/api/auth/steam',
  ps: '/settings/platforms/ps/connect',
  xb: null,
  gg: null,
  nt: null,
  ep: null,
};

const PLATFORM_NAMES: Record<string, string> = {
  st: 'Steam', ps: 'PSN', xb: 'Xbox', gg: 'GOG', nt: 'Nintendo', ep: 'Epic Games',
};

type MobileTab = 'auth' | 'scope' | 'sync' | 'log';

export function PlatformDetailMobile() {
  const { code = '' } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const name = PLATFORM_NAMES[code.toLowerCase()] ?? code.toUpperCase();
  useDocumentTitle(`${name} · platforms`);
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

  function handleSyncFrequencyChange(freq: SyncFrequency) {
    if (!platform) return;
    setPlatform({ ...platform, syncFrequency: freq });
    void api.updatePlatform(code.toUpperCase(), { syncFrequency: freq }).catch(() => {
      setPlatform(platform);
    });
  }

  const isConnected = !!platform;
  const rawStatus = isConnected ? (syncing ? 'syncing' : platform.syncStatus) : 'available';
  const status: PlatConnectStatus = (rawStatus === 'ok' ? 'connected' : rawStatus) as PlatConnectStatus;

  const noApi = code === 'nt' || code === 'ep';

  return (
    <>
      <MobileHeader
        title={name.toLowerCase()}
        sub={`// ${isConnected ? 'connected' : 'not connected'}`}
        back
      />

      {/* identity strip */}
      <div style={{ padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'center', borderBottom: '1px solid var(--rule)' }}>
        <div style={{ width: 44, height: 44, border: `1px solid ${isConnected ? 'var(--rule-bright)' : 'var(--rule)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="t-display" style={{ fontSize: "var(--text-md)", color: isConnected ? 'var(--paper)' : 'var(--paper-faint)' }}>
            {code.toUpperCase()}
          </span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "var(--text-sm)" }}>{platform?.who ?? name}</div>
          {isConnected && (
            <div className="t-faint" style={{ fontSize: "var(--text-3xs)" }}>
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
            <div className="t-faint" style={{ fontSize: "var(--text-xs)", marginTop: 8, lineHeight: 1.5 }}>
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
              <div className="t-up t-faint" style={{ fontSize: "var(--text-2xs)" }}>// npsso token</div>
              <input
                className="field"
                value={npssoInput}
                onChange={(e) => setNpssoInput(e.target.value)}
                placeholder="paste 64-char NPSSO token"
                style={{ width: '100%', marginTop: 8, background: 'var(--ink-2)', border: '1px solid var(--rule-bright)', color: 'var(--paper)', fontFamily: 'var(--mono)', fontSize: "var(--text-2xs)", padding: '0 12px', height: 36, outline: 'none' }}
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
          ) : (() => {
            const connectPath = PLATFORM_CONNECT_PATH[code.toLowerCase()];
            const isApiConnect = connectPath?.startsWith('/api/') ?? false;
            return isApiConnect ? (
              <Btn variant="primary" style={{ width: '100%' }}
                onClick={() => { window.location.href = `${API_BASE}${connectPath!}`; }}>
                <Icon name="link" size={11} /> connect {name}
              </Btn>
            ) : (
              <Btn variant="primary" style={{ width: '100%' }}>
                <Icon name="link" size={11} /> connect {name}
              </Btn>
            );
          })()}
        </div>
      )}

      {/* connected: tab strip + content */}
      {isConnected && (
        <>
          <div role="tablist" aria-label="Platform sections" style={{ display: 'flex', borderBottom: '1px solid var(--rule)', padding: '0 16px' }}>
            {(['auth', 'scope', 'sync', 'log'] as MobileTab[]).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={activeTab === t}
                onClick={() => setActiveTab(t)}
                style={{
                  padding: '10px 0', marginRight: 18,
                  fontSize: "var(--text-2xs)", fontFamily: 'var(--mono)',
                  textTransform: 'uppercase', letterSpacing: '0.1em',
                  color: activeTab === t ? 'var(--paper)' : 'var(--paper-dim)',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `2px solid ${activeTab === t ? 'var(--green)' : 'transparent'}`,
                  marginBottom: -1,
                  cursor: 'pointer',
                }}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '14px 16px' }}>
            {activeTab === 'auth' && (
              <div>
                {code.toLowerCase() === 'ps' ? (
                  <>
                    <div className="t-up t-faint" style={{ fontSize: "var(--text-2xs)" }}>// active token</div>
                    <div className="field" style={{ marginTop: 8, fontSize: "var(--text-2xs)" }}>
                      <Icon name="key" size={11} style={{ color: 'var(--amber)' }} />
                      <span style={{ color: 'var(--paper-dim)' }}>NPSSO•••••••••8e2f</span>
                    </div>
                    <div className="t-faint" style={{ fontSize: "var(--text-3xs)", marginTop: 6 }}>
                      last sync: {platform?.lastSyncAt ? relativeTime(platform.lastSyncAt) : 'never'}
                    </div>
                    <div style={{ marginTop: 16 }}>
                      <Toggle on={true} label="auto-refresh 7d before expiry" />
                    </div>
                  </>
                ) : (
                  <div className="t-faint" style={{ fontSize: "var(--text-xs)", lineHeight: 1.5 }}>
                    Connected. Last sync: {platform?.lastSyncAt ? new Date(platform.lastSyncAt).toLocaleDateString() : 'never'}.
                  </div>
                )}
                <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Btn onClick={handleSync} disabled={syncing}>
                    <Icon name="refresh" size={11} /> {syncing ? 'syncing…' : 'sync now'}
                  </Btn>
                  {syncing && <span className="t-faint" style={{ fontSize: "var(--text-3xs)" }}>importing your library…</span>}
                  <Btn style={{ color: 'var(--red)', borderColor: 'var(--red)' }}
                    onClick={() => void api.disconnectPlatform(code.toUpperCase()).then(() => navigate('/settings/platforms'))}>
                    <Icon name="x" size={11} /> disconnect
                  </Btn>
                </div>
              </div>
            )}
            {activeTab === 'scope' && (
              <div>
                <Marker>// scope · what hoard reads</Marker>
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {([
                    ['library',  'owned games + entitlements', true],
                    ['playtime', 'hours per game',             true],
                    ['trophies', 'achievement progress',       true],
                    ['friends',  'friend list',                false],
                  ] as [string, string, boolean][]).map(([k, d, on]) => (
                    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: "var(--text-xs)" }}>
                      <span style={{ width: 14, height: 14, border: '1px solid var(--rule-bright)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} aria-hidden="true">
                        {on && <Icon name="check" size={9} style={{ color: 'var(--green)' }} />}
                      </span>
                      <span style={{ color: on ? 'var(--paper)' : 'var(--paper-dim)' }}>{k}</span>
                      <span className="t-faint" style={{ fontSize: "var(--text-3xs)" }}>· {d}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {activeTab === 'sync' && (
              <div>
                <Marker>// sync schedule</Marker>
                <div style={{ marginTop: 12 }}>
                  <div className="t-up t-faint" style={{ fontSize: "var(--text-3xs)", marginBottom: 8 }}>// frequency</div>
                  <div role="radiogroup" aria-label="Sync frequency" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {([
                      ['FIVE_MIN',    'every 5 minutes',  null],
                      ['FIFTEEN_MIN', 'every 15 minutes', null],
                      ['HOURLY',      'every hour',       null],
                      ['MANUAL',      'manual only',      'sync only when you tap below'],
                    ] as [SyncFrequency, string, string | null][]).map(([value, label, sub]) => (
                      <Radio
                        key={value}
                        name="sync-freq"
                        on={platform?.syncFrequency === value}
                        label={label}
                        {...(sub ? { sub } : {})}
                        onClick={() => handleSyncFrequencyChange(value)}
                      />
                    ))}
                  </div>
                </div>
                <div className="t-faint" style={{ fontSize: "var(--text-xs)", marginTop: 14 }}>
                  Last sync: {platform?.lastSyncAt ? new Date(platform.lastSyncAt).toLocaleString() : 'never'}.
                </div>
              </div>
            )}
            {activeTab === 'log' && (
              <pre className="ascii t-faint" style={{ fontSize: "var(--text-3xs)", lineHeight: 1.7 }}>
                {'// no log entries yet'}
              </pre>
            )}
          </div>
        </>
      )}

      {!isConnected && <div style={{ flex: 1 }} />}
    </>
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
