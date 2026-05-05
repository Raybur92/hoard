import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { TopBar } from '../layout/TopBar';
import { SettingsNav, SettingsRow, Toggle, Radio, PlatformDot } from '../settings';
import type { PlatConnectStatus } from '../settings';
import { Icon } from '../primitives/Icon';
import { Btn } from '../primitives/Btn';
import { Marker } from '../primitives/Marker';
import { api } from '../../lib/api';
import type { PlatformDetail } from '@hoard/types';

const PLATFORM_INFO: Record<string, {
  name: string;
  fullName: string;
  syncable: boolean;
  authMethod: string;
  connectPath: string | null;
}> = {
  st: { name: 'ST', fullName: 'Steam',             syncable: true,  authMethod: 'OAuth · Steam OpenID',       connectPath: '/api/auth/steam' },
  ps: { name: 'PS', fullName: 'PlayStation Network',syncable: true,  authMethod: 'NPSSO token',                connectPath: '/settings/platforms/ps/connect' },
  xb: { name: 'XB', fullName: 'Xbox',              syncable: true,  authMethod: 'OpenXBL API key',            connectPath: null },
  gg: { name: 'GG', fullName: 'GOG',               syncable: true,  authMethod: 'OAuth · community API',      connectPath: null },
  nt: { name: 'NT', fullName: 'Nintendo',           syncable: false, authMethod: 'no public api',              connectPath: null },
  ep: { name: 'EP', fullName: 'Epic Games',         syncable: false, authMethod: 'manual import only',         connectPath: null },
};

type TabKey = 'authentication' | 'scope' | 'sync' | 'log';

export function PlatformDetailDesktop() {
  const { code = '' } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const info = PLATFORM_INFO[code.toLowerCase()];
  useDocumentTitle(info ? `${info.name} · platforms` : 'Platforms');
  const [activeTab, setActiveTab] = useState<TabKey>('authentication');
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

  // Poll every 2s while a sync is in progress
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
    void api.syncPlatform(info?.name ?? code.toUpperCase()).catch(() => setSyncing(false));
  }

  if (!info) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
        <span className="t-faint">Unknown platform</span>
      </div>
    );
  }

  const isConnected = !!platform;
  const rawStatus = isConnected ? (syncing ? 'syncing' : platform.syncStatus) : 'available';
  const status: PlatConnectStatus = (rawStatus === 'ok' ? 'connected' : rawStatus) as PlatConnectStatus;

  const TABS: [TabKey, string][] = [
    ['authentication', 'authentication'],
    ['scope',          'scope & permissions'],
    ['sync',           'sync schedule'],
    ['log',            'activity log'],
  ];

  return (
    <>
      <TopBar crumbs={['hoard', 'settings', 'platforms', info.name]} />
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <SettingsNav active="Platforms" />
        <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '28px 40px 40px', maxWidth: 1080 }}>

            {/* back link */}
            <button
              type="button"
              onClick={() => navigate('/settings/platforms')}
              aria-label="Back to all platforms"
              style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 18, cursor: 'pointer', background: 'transparent', border: 'none', padding: 0, fontFamily: 'inherit', color: 'inherit' }}
            >
              <span className="t-mono t-faint" style={{ fontSize: "var(--text-2xs)", display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Icon name="back" size={11} /> all platforms
              </span>
            </button>

            {/* hero header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24, paddingBottom: 22, borderBottom: '1px solid var(--rule)' }}>
              <div style={{
                width: 72, height: 72,
                border: `1px solid ${isConnected ? 'var(--rule-bright)' : 'var(--rule)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--ink-2)',
              }}>
                <span className="t-display" style={{ fontSize: 32, color: isConnected ? 'var(--paper)' : 'var(--paper-faint)' }}>
                  {info.name}
                </span>
              </div>
              <div style={{ flex: 1 }}>
                <Marker>// platform / {info.fullName.toLowerCase()}</Marker>
                <div className="t-display" style={{ fontSize: 34, marginTop: 6, color: 'var(--paper)', letterSpacing: '-0.01em' }}>
                  {info.name}
                </div>
                <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 12, fontSize: "var(--text-xs)", color: 'var(--paper-dim)' }}>
                  <PlatformDot status={status} />
                  {isConnected && platform.who && <span>signed in as <span style={{ color: 'var(--paper)' }}>{platform.who}</span></span>}
                  {isConnected && platform.lastSyncAt && (
                    <span>· last sync {relativeTime(platform.lastSyncAt)}</span>
                  )}
                </div>
              </div>
              {isConnected ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn sm onClick={handleSync} disabled={syncing}>
                    <Icon name="refresh" size={11} /> {syncing ? 'syncing…' : 'sync now'}
                  </Btn>
                  <Btn sm style={{ color: 'var(--red)', borderColor: 'var(--red)' }}
                    onClick={() => void api.disconnectPlatform(info.name).then(() => navigate('/settings/platforms'))}>
                    <Icon name="x" size={11} /> disconnect
                  </Btn>
                </div>
              ) : info.syncable ? (
                <ConnectButton info={info} code={code} npssoInput={npssoInput} setNpssoInput={setNpssoInput} />
              ) : null}
            </div>

            {/* unsupported (Nintendo / Epic) */}
            {!info.syncable && (
              <div className="panel" style={{ marginTop: 24, padding: 18, display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <Icon name="info" size={16} style={{ color: 'var(--paper-dim)', marginTop: 2 }} />
                <div>
                  <div style={{ fontSize: "var(--text-sm)", color: 'var(--paper)' }}>manual import only</div>
                  <div className="t-faint" style={{ fontSize: "var(--text-xs)", marginTop: 6, lineHeight: 1.5 }}>
                    {info.fullName} has no public API. Add games manually using the Library → Add game button. Choose <strong>{info.fullName}</strong> as the platform label.
                  </div>
                </div>
              </div>
            )}

            {/* connected: tabs + content */}
            {isConnected && (
              <>
                {/* tab strip */}
                <div role="tablist" aria-label="Platform sections" style={{ marginTop: 22, display: 'flex', gap: 24, borderBottom: '1px solid var(--rule)' }}>
                  {TABS.map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={activeTab === key}
                      onClick={() => setActiveTab(key)}
                      style={{
                        padding: '10px 0',
                        fontSize: "var(--text-2xs)", fontFamily: 'var(--mono)',
                        textTransform: 'uppercase', letterSpacing: '0.12em',
                        color: activeTab === key ? 'var(--paper)' : 'var(--paper-dim)',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: `2px solid ${activeTab === key ? 'var(--green)' : 'transparent'}`,
                        marginBottom: -1,
                        cursor: 'pointer',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* tab body */}
                <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: '1fr 320px', gap: 32 }}>
                  <div>
                    {activeTab === 'authentication' && (
                      <AuthTab code={code} platform={platform} />
                    )}
                    {activeTab === 'scope' && <ScopeTab />}
                    {activeTab === 'sync'  && <SyncTab platform={platform} code={info.name} syncing={syncing} onSync={handleSync} />}
                    {activeTab === 'log'   && <LogTab />}
                  </div>

                  {/* right: stats sidebar */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div className="panel" style={{ padding: 14 }}>
                      <Marker>// at a glance</Marker>
                      <pre className="ascii t-dim" style={{ fontSize: "var(--text-2xs)", lineHeight: 1.7, margin: '10px 0 0' }}>
{`games       ${platform.gameCount ?? '—'}
last sync   ${platform.lastSyncAt ? relativeTime(platform.lastSyncAt) : 'never'}`}
                      </pre>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* not-yet-connected: PSN inline guide */}
            {!isConnected && info.syncable && code.toLowerCase() !== 'ps' && (
              <div style={{ marginTop: 28 }}>
                <div className="t-faint" style={{ fontSize: "var(--text-xs)", marginTop: 12 }}>
                  Connect your {info.fullName} account to import your library and playtime.
                </div>
              </div>
            )}

            {/* PSN connect flow hint */}
            {!isConnected && code.toLowerCase() === 'ps' && (
              <PsnConnectPanel npssoInput={npssoInput} setNpssoInput={setNpssoInput} />
            )}

        </div>
      </div>
    </>
  );
}

function ConnectButton({ info, code, npssoInput: _npssoInput, setNpssoInput: _setNpssoInput }: {
  info: typeof PLATFORM_INFO[string];
  code: string;
  npssoInput: string;
  setNpssoInput: (v: string) => void;
}) {
  const navigate = useNavigate();
  if (code.toLowerCase() === 'ps') {
    return (
      <Btn sm variant="primary" onClick={() => navigate('/settings/platforms/ps/connect')}>
        <Icon name="key" size={11} /> connect via npsso →
      </Btn>
    );
  }
  if (info.connectPath?.startsWith('/api/')) {
    return (
      <Btn sm variant="primary" onClick={() => { window.location.href = info.connectPath!; }}>
        <Icon name="link" size={11} /> connect
      </Btn>
    );
  }
  return (
    <Btn sm variant="primary">
      <Icon name="link" size={11} /> connect
    </Btn>
  );
}

function PsnConnectPanel({ npssoInput, setNpssoInput }: { npssoInput: string; setNpssoInput: (v: string) => void }) {
  const navigate = useNavigate();
  return (
    <div style={{ marginTop: 28 }}>
      <div className="panel" style={{ padding: 20 }}>
        <Marker>// connect psn via npsso token</Marker>
        <div className="t-faint" style={{ fontSize: "var(--text-xs)", marginTop: 8, lineHeight: 1.55, maxWidth: 600 }}>
          PSN has no public API. Hoard uses the same session token your browser uses. Your password is never seen by Hoard.
          Follow the <button
            type="button"
            onClick={() => navigate('/settings/platforms/ps/connect')}
            style={{ color: 'var(--paper)', cursor: 'pointer', background: 'transparent', border: 'none', padding: 0, font: 'inherit', textDecoration: 'underline' }}
          >guided flow →</button> for step-by-step instructions.
        </div>
        <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            className="field"
            value={npssoInput}
            onChange={(e) => setNpssoInput(e.target.value)}
            placeholder="paste your 64-character NPSSO token here"
            style={{ flex: 1, background: 'var(--ink-2)', border: '1px solid var(--rule-bright)', color: 'var(--paper)', fontFamily: 'var(--mono)', fontSize: "var(--text-xs)", padding: '0 12px', height: 36, outline: 'none' }}
            maxLength={64}
          />
          <Btn sm variant="primary" disabled={npssoInput.length !== 64}
            onClick={() => void api.connectPsn(npssoInput).then(() => window.location.reload())}>
            save
          </Btn>
        </div>
        {npssoInput.length > 0 && npssoInput.length < 64 && (
          <div className="t-faint" style={{ fontSize: "var(--text-3xs)", marginTop: 6 }}>
            {npssoInput.length}/64 characters
          </div>
        )}
      </div>
    </div>
  );
}

function AuthTab({ code, platform }: { code: string; platform: PlatformDetail }) {
  if (code.toLowerCase() === 'ps') {
    return (
      <div>
        <Marker>// authentication · token &amp; method</Marker>
        <div style={{ marginTop: 16, padding: 16, border: '1px solid var(--rule)', background: 'var(--ink)' }}>
          <div className="t-up t-faint" style={{ fontSize: "var(--text-3xs)" }}>// active token</div>
          <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
            <div className="field" style={{ flex: 1 }}>
              <Icon name="key" size={11} style={{ color: 'var(--amber)' }} />
              <span style={{ color: 'var(--paper-dim)', fontFamily: 'var(--mono)' }}>NPSSO•••••••••••••••••••••••8e2f</span>
            </div>
            <Btn sm><Icon name="eye" size={10} /> reveal</Btn>
          </div>
          <div className="kv" style={{ marginTop: 14 }}>
            <span>last sync</span><span className="t-tnum">{platform.lastSyncAt ? new Date(platform.lastSyncAt).toLocaleString() : 'never'}</span>
            <span>method</span><span>NPSSO cookie</span>
          </div>
        </div>
        <div style={{ marginTop: 18 }}>
          <SettingsRow label="auto-refresh" hint="hoard tries to renew the token 7 days before expiry.">
            <Toggle on={true} label="enabled" />
          </SettingsRow>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Marker>// authentication · {code.toUpperCase()}</Marker>
      <div style={{ marginTop: 16, fontSize: "var(--text-xs)", color: 'var(--paper-dim)', lineHeight: 1.5 }}>
        Connected via {PLATFORM_INFO[code.toLowerCase()]?.authMethod ?? 'OAuth'}.
        Last sync: {platform.lastSyncAt ? new Date(platform.lastSyncAt).toLocaleString() : 'never'}.
      </div>
    </div>
  );
}

function ScopeTab() {
  const scopes = [
    ['library', 'owned games + entitlements', true],
    ['playtime', 'hours per game', true],
    ['trophies', 'achievement progress', true],
    ['friends',  'friend list', false],
  ] as const;
  return (
    <div>
      <Marker>// scope · what hoard reads</Marker>
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {scopes.map(([k, d, on]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: "var(--text-xs)" }}>
            <span style={{ width: 12, height: 12, border: '1px solid var(--rule-bright)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              {on && <Icon name="check" size={9} style={{ color: 'var(--green)' }} />}
            </span>
            <span style={{ color: on ? 'var(--paper)' : 'var(--paper-dim)' }}>{k}</span>
            <span className="t-faint" style={{ fontSize: "var(--text-3xs)" }}>· {d}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SyncTab({ platform, syncing, onSync }: { platform: PlatformDetail; code: string; syncing: boolean; onSync: () => void }) {
  return (
    <div>
      <Marker>// sync schedule</Marker>
      <div style={{ marginTop: 16 }}>
        <SettingsRow label="sync frequency" hint="how often hoard polls your library.">
          <div style={{ display: 'flex', gap: 2 }}>
            <Radio on={false} label="5m" />
            <Radio on={true}  label="15m" />
            <Radio on={false} label="1h" />
            <Radio on={false} label="manual" />
          </div>
        </SettingsRow>
      </div>
      <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
        <Btn sm onClick={onSync} disabled={syncing}>
          <Icon name="refresh" size={10} /> {syncing ? 'syncing…' : 'sync now'}
        </Btn>
        {syncing && <span className="t-faint" style={{ fontSize: "var(--text-3xs)" }}>importing your library…</span>}
      </div>
      <div className="t-faint" style={{ fontSize: "var(--text-2xs)", marginTop: 10 }}>
        last sync: {platform.lastSyncAt ? new Date(platform.lastSyncAt).toLocaleString() : 'never'}
      </div>
    </div>
  );
}

function LogTab() {
  return (
    <div>
      <Marker>// activity log</Marker>
      <pre className="ascii t-faint" style={{ fontSize: "var(--text-2xs)", lineHeight: 1.7, marginTop: 12 }}>
        {`// no log entries yet`}
      </pre>
    </div>
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
