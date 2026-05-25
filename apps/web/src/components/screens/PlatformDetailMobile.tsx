import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { MobileHeader } from '../layout/MobileHeader';
import { PlatformDot, Radio } from '../settings';
import type { PlatConnectStatus } from '../settings';
import { Icon } from '../primitives/Icon';
import { Btn } from '../primitives/Btn';
import { Marker } from '../primitives/Marker';
import { api } from '../../lib/api';
import type { PlatformDetail, SyncFrequency } from '@hoard/types';
import { PlatformLogTab } from './PlatformLogTab';

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

// PR B reintroduces the activity log tab with a real PlatformLog model
// behind it (see docs/SETTINGS_AUDIT_PLAN.md L1–L4).
type MobileTab = 'auth' | 'scope' | 'sync' | 'log';

export function PlatformDetailMobile() {
  const { code = '' } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const name = PLATFORM_NAMES[code.toLowerCase()] ?? code.toUpperCase();
  useDocumentTitle(`${name} · platforms`);
  const [activeTab, setActiveTab] = useState<MobileTab>('auth');
  const [platform, setPlatform] = useState<PlatformDetail | null>(null);
  const [npssoInput, setNpssoInput] = useState('');
  const [xboxApiKeyInput, setXboxApiKeyInput] = useState('');
  const [xboxConnectError, setXboxConnectError] = useState<string | null>(null);
  const [xboxSaving, setXboxSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  // S1 — local state for the reveal-NPSSO toggle on the auth tab.
  const [revealedNpsso, setRevealedNpsso] = useState<string | null>(null);
  const [revealError, setRevealError] = useState<string | null>(null);
  // S2 — re-paste flow for when the token has expired.
  const [reConnecting, setReConnecting] = useState(false);
  const [reNpsso, setReNpsso] = useState('');

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

  // S1 — reveal/hide the user's NPSSO. Server returns it on demand
  // (no client-side cache); same fetch shape as desktop.
  async function handleReveal() {
    if (revealedNpsso) {
      setRevealedNpsso(null);
      return;
    }
    setRevealError(null);
    try {
      const { npsso } = await api.getPlatformCredentials('ps');
      setRevealedNpsso(npsso ?? null);
    } catch {
      setRevealError('Could not fetch token. Try again.');
    }
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
          ) : code.toLowerCase() === 'xb' ? (
            <div>
              <div className="t-up t-faint" style={{ fontSize: "var(--text-2xs)" }}>// openxbl api key</div>
              <div className="t-faint" style={{ fontSize: "var(--text-3xs)", marginTop: 6, lineHeight: 1.5 }}>
                Get a key at{' '}
                <a href="https://xbl.io" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--paper)', textDecoration: 'underline' }}>xbl.io</a>
                {' '}— free tier covers 150 req/hour. Your Microsoft password is never seen by Hoard.
              </div>
              <input
                className="field"
                value={xboxApiKeyInput}
                onChange={(e) => { setXboxApiKeyInput(e.target.value); if (xboxConnectError) setXboxConnectError(null); }}
                placeholder="paste OpenXBL API key"
                style={{ width: '100%', marginTop: 10, background: 'var(--ink-2)', border: '1px solid var(--rule-bright)', color: 'var(--paper)', fontFamily: 'var(--mono)', fontSize: "var(--text-2xs)", padding: '0 12px', height: 36, outline: 'none' }}
                aria-label="OpenXBL API key"
                aria-invalid={xboxConnectError !== null}
              />
              <div style={{ marginTop: 8 }}>
                <Btn sm variant="primary" disabled={xboxApiKeyInput.trim().length < 10 || xboxSaving}
                  onClick={() => {
                    if (xboxSaving) return;
                    setXboxSaving(true);
                    setXboxConnectError(null);
                    void api.connectXbox(xboxApiKeyInput.trim())
                      .then(() => window.location.reload())
                      .catch((e: unknown) => {
                        setXboxConnectError(e instanceof Error ? e.message : 'Failed to save Xbox API key');
                        setXboxSaving(false);
                      });
                  }}>
                  {xboxSaving ? 'saving…' : 'save key'}
                </Btn>
              </div>
              {xboxConnectError && (
                <div className="t-mono t-red" role="alert" style={{ fontSize: "var(--text-3xs)", marginTop: 8 }}>
                  // {xboxConnectError}
                </div>
              )}
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
                    <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
                      <div className="field" style={{ flex: 1, fontSize: "var(--text-2xs)", overflow: 'hidden' }}>
                        <Icon name="key" size={11} style={{ color: 'var(--amber)' }} />
                        <span style={{ color: 'var(--paper-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {revealedNpsso ?? 'NPSSO ' + '•'.repeat(58)}
                        </span>
                      </div>
                      <Btn sm onClick={() => void handleReveal()}>
                        <Icon name="eye" size={10} /> {revealedNpsso ? 'hide' : 'reveal'}
                      </Btn>
                    </div>
                    {revealError && <div className="t-mono" style={{ fontSize: "var(--text-3xs)", color: 'var(--red)', marginTop: 6 }} role="alert">{revealError}</div>}

                    {/* S2 — token-health row replaces the lying auto-refresh toggle. */}
                    <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ display: 'inline-block', width: 8, height: 8, background: platform?.syncStatus === 'ok' ? 'var(--green)' : 'var(--red)' }} aria-hidden="true" />
                      <span className="t-mono" style={{ fontSize: "var(--text-2xs)", color: 'var(--paper-dim)', flex: 1 }}>
                        {platform?.syncStatus === 'ok'
                          ? `// connection healthy · synced ${platform?.lastSyncAt ? relativeTime(platform.lastSyncAt) : 'never'}`
                          : '// last sync failed — token may be expired'}
                      </span>
                    </div>
                    {platform && platform.syncStatus !== 'ok' && !reConnecting && (
                      <div style={{ marginTop: 10 }}>
                        <Btn sm onClick={() => setReConnecting(true)}>paste new token</Btn>
                      </div>
                    )}
                    {reConnecting && (
                      <div style={{ marginTop: 14, padding: 12, border: '1px dashed var(--rule-bright)', background: 'var(--ink-2)' }}>
                        <label htmlFor="repaste-npsso-mobile" className="t-up t-faint" style={{ fontSize: "var(--text-3xs)" }}>// new npsso token (64 chars)</label>
                        <input
                          id="repaste-npsso-mobile"
                          className="field"
                          value={reNpsso}
                          onChange={(e) => setReNpsso(e.target.value)}
                          placeholder="paste from your psn cookies…"
                          style={{ width: '100%', marginTop: 8, padding: '0 10px', height: 36 }}
                          maxLength={64}
                        />
                        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                          <Btn sm onClick={() => { setReConnecting(false); setReNpsso(''); }}>cancel</Btn>
                          <Btn sm variant="primary" disabled={reNpsso.length !== 64}
                            onClick={() => void api.connectPsn(reNpsso).then(() => window.location.reload())}>
                            save token
                          </Btn>
                        </div>
                      </div>
                    )}
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
                {/* S3 — read-only info display. Same rationale as desktop:
                    none of these are toggleable in v1, so we drop the
                    checkbox visual entirely and use plain icons. */}
                <Marker>// what hoard reads</Marker>
                <div className="t-faint" style={{ fontSize: "var(--text-3xs)", marginTop: 4 }}>
                  non-toggleable in v1 · what's pulled is fixed by platform.
                </div>
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {([
                    ['library',  'owned games + entitlements', true],
                    ['playtime', 'hours per game',             true],
                    ['trophies', 'achievement progress',       true],
                    ['friends',  'friend list',                false],
                  ] as [string, string, boolean][]).map(([k, d, on]) => (
                    <div key={k}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: "var(--text-xs)" }}>
                        <Icon name={on ? 'check' : 'x'} size={11} style={{ color: on ? 'var(--green)' : 'var(--red)' }} />
                        <span style={{ color: on ? 'var(--paper)' : 'var(--paper-dim)' }}>{k}</span>
                        <span className="t-faint" style={{ fontSize: "var(--text-3xs)" }}>· {d}</span>
                      </div>
                      {/* T-D7 amendment: Steam-only public-profile note. */}
                      {k === 'trophies' && code.toLowerCase() === 'st' && (
                        <div className="t-faint" style={{ marginLeft: 24, marginTop: 4, fontSize: "var(--text-3xs)", lineHeight: 1.5 }}>
                          // note · steam profile must be public for achievement sync.
                          <br />
                          <span style={{ marginLeft: 8 }}>settings → privacy → game details on steam.</span>
                        </div>
                      )}
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
            {activeTab === 'log' && <PlatformLogTab code={code} />}
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
