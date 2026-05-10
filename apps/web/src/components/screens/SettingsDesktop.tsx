import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { ConfirmModal } from '../modals/ConfirmModal';
import { TopBar } from '../layout/TopBar';
import { SettingsNav, SettingsRow, Toggle, Radio, PlatformDot } from '../settings';
import type { SettingsSection, PlatConnectStatus } from '../settings';
import { Icon } from '../primitives/Icon';
import { Btn } from '../primitives/Btn';
import { Marker } from '../primitives/Marker';
import { Plat } from '../primitives/Plat';
import { Hr } from '../primitives/Hr';
import { api } from '../../lib/api';
import { useUser } from '../../contexts/UserContext';
import { usePreferences } from '../../contexts/PreferencesContext';
import type { AuthUser, PlatformDetail, PlatformCode } from '@hoard/types';

const SECTION_LABELS: Record<string, string> = {
  account:      'account',
  platforms:    'platforms',
  library:      'library',
  notifications:'notifications',
  appearance:   'appearance',
  privacy:      'privacy',
  export:       'data export',
  danger:       'danger zone',
};

const SECTION_TO_NAV: Record<string, SettingsSection> = {
  account:      'Account',
  platforms:    'Platforms',
  library:      'Library',
  notifications:'Notifications',
  appearance:   'Appearance',
  privacy:      'Privacy',
  export:       'Data export',
  danger:       'Danger zone',
};

function resolveSection(raw: string | undefined): string {
  return raw ?? 'account';
}

export function SettingsDesktop() {
  useDocumentTitle("Settings");
  const { section: rawSection } = useParams<{ section: string }>();
  const section = resolveSection(rawSection);
  const navSection = SECTION_TO_NAV[section] ?? 'Account';
  const crumbLabel = SECTION_LABELS[section] ?? section;

  const { user } = useUser();
  const [platforms, setPlatforms] = useState<PlatformDetail[]>([]);

  const refetchPlatforms = useCallback(async (): Promise<PlatformDetail[]> => {
    try {
      const r = await api.platformStatus();
      setPlatforms(r.platforms);
      return r.platforms;
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    void refetchPlatforms();
  }, [refetchPlatforms]);

  return (
    <>
      <TopBar crumbs={['hoard', 'settings', crumbLabel]} />
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <SettingsNav active={navSection} />
        <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '28px 40px 40px', maxWidth: 880 }}>
          {section === 'account'       && <AccountSection user={user} />}
          {section === 'platforms'     && <PlatformsSection platforms={platforms} refetch={refetchPlatforms} />}
          {section === 'appearance'    && <AppearanceSection />}
          {section === 'danger'        && <DangerSection user={user} />}
          {section === 'library'       && <StubSection title="library" />}
          {section === 'notifications' && <StubSection title="notifications" />}
          {section === 'privacy'       && <StubSection title="privacy" />}
          {section === 'export'        && <StubSection title="data export" />}
        </div>
      </div>
    </>
  );
}

/* ── Account section ── */

function AccountSection({ user: initialUser }: { user: AuthUser | null }) {
  const [name, setName] = useState(initialUser?.name ?? '');
  const [email, setEmail] = useState(initialUser?.email ?? '');
  const [saved, setSaved] = useState<'name' | 'email' | null>(null);
  const [createdAt, setCreatedAt] = useState(initialUser?.createdAt ?? '');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (initialUser) {
      setName(initialUser.name ?? '');
      setEmail(initialUser.email ?? '');
      setCreatedAt(initialUser.createdAt);
    }
  }, [initialUser]);

  async function saveField(field: 'name' | 'email', value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    const current = field === 'name' ? initialUser?.name : initialUser?.email;
    if (trimmed === current) return;
    try {
      await api.updateMe({ [field]: trimmed });
      if (timerRef.current) clearTimeout(timerRef.current);
      setSaved(field);
      timerRef.current = setTimeout(() => setSaved(null), 2000);
    } catch { /* silently ignore */ }
  }

  return (
    <>
      <Marker>// account · {name || 'loading…'}</Marker>
      <div className="t-display" style={{ fontSize: "var(--text-xl)", marginTop: 8, color: 'var(--paper)', letterSpacing: '-0.01em' }}>
        account
      </div>
      <div className="t-mono t-faint" style={{ fontSize: "var(--text-2xs)", marginTop: 4 }}>
        member since {createdAt ? new Date(createdAt).getFullYear() : '…'}
      </div>

      <div style={{ marginTop: 28 }}>
        <SettingsRow label="display name" hint="shown on your profile and shared receipts.">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              className="field"
              style={{ width: 320 }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => void saveField('name', name)}
              placeholder="display name"
            />
            {saved === 'name' && <span role="status" aria-live="polite" className="t-mono t-green" style={{ fontSize: "var(--text-3xs)" }}>// saved</span>}
          </div>
        </SettingsRow>

        <SettingsRow label="email" hint="used for sign-in, magic links, and digest emails.">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              className="field"
              type="email"
              style={{ width: 320 }}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => void saveField('email', email)}
              placeholder="email address"
            />
            {saved === 'email'
              ? <span role="status" aria-live="polite" className="t-mono t-green" style={{ fontSize: "var(--text-3xs)" }}>// saved</span>
              : <span className="chip" style={{ color: 'var(--green)', borderColor: 'var(--green)' }}>
                  <Icon name="check" size={10} /> verified
                </span>
            }
          </div>
        </SettingsRow>

        <SettingsRow
          label={<>profile visibility <span style={{ marginLeft: 8, fontSize: 'var(--text-3xs)', color: 'var(--amber)', letterSpacing: '0.1em' }}>// v2</span></>}
          hint="who can see your library, stats, and notes. visibility controls land in v2."
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, opacity: 0.5, pointerEvents: 'none' }}>
            <Radio on={false} label="public"   sub="anyone with the link" />
            <Radio on={true}  label="unlisted" sub="link required — not indexed" />
            <Radio on={false} label="private"  sub="only you, signed in" />
          </div>
        </SettingsRow>

        <SettingsRow
          label={<>session <span style={{ marginLeft: 8, fontSize: 'var(--text-3xs)', color: 'var(--amber)', letterSpacing: '0.1em' }}>// v2</span></>}
          hint="active devices with hoard signed in. revocation lands in v2."
        >
          <pre className="ascii t-dim" style={{ fontSize: "var(--text-2xs)", lineHeight: 1.7, margin: 0, opacity: 0.5 }}>
{`▸ this browser     · active now
  Hoard PWA        · last seen 2h ago
  Safari · macOS   · last seen 4d ago`}
          </pre>
        </SettingsRow>

        <SettingsRow label="sign out" hint="end your current session on this device.">
          <SignOutBtn />
        </SettingsRow>
      </div>
    </>
  );
}

function SignOutBtn() {
  const navigate = useNavigate();
  return (
    <Btn
      sm
      onClick={() => {
        void api.logout().then(() => navigate('/login'));
      }}
    >
      <Icon name="x" size={10} /> sign out
    </Btn>
  );
}

/* ── Platforms section ── */

const PLATFORM_META: Array<{
  code: string;
  name: string;
  syncable: boolean;
  via: string;
}> = [
  { code: 'ST', name: 'Steam',            syncable: true,  via: 'OAuth · public profile + library' },
  { code: 'PS', name: 'PSN',              syncable: true,  via: 'NPSSO token · re-paste required' },
  { code: 'XB', name: 'Xbox',             syncable: true,  via: 'OpenXBL API key' },
  { code: 'GG', name: 'GOG',              syncable: true,  via: 'OAuth · community API' },
  { code: 'NT', name: 'Nintendo',         syncable: false, via: 'no public api · manual import' },
  { code: 'EP', name: 'Epic Games',       syncable: false, via: 'manual import only' },
];

function PlatformsSection({ platforms, refetch }: { platforms: PlatformDetail[]; refetch: () => Promise<PlatformDetail[]> }) {
  const navigate = useNavigate();
  const connectedCodes = new Set(platforms.map((p) => p.code));

  const connected = PLATFORM_META.filter((m) => connectedCodes.has(m.code as PlatformCode));
  const available = PLATFORM_META.filter((m) => !connectedCodes.has(m.code as PlatformCode));

  const getDetail = (code: string) => platforms.find((p) => p.code === code);

  // PR C — C3: sync-all kicks off every connected, syncable platform's sync
  // in parallel, then polls platform-status every 2s until none are 'syncing'.
  // The button is disabled while a sync is running. aria-live updates a
  // status message ("// syncing 2 platforms…" → "// done — synced").
  const [syncing, setSyncing] = useState(false);
  const [liveStatus, setLiveStatus] = useState<string | null>(null);
  const syncableConnected = platforms.filter((p) => p.syncable);

  async function handleSyncAll() {
    if (syncableConnected.length === 0 || syncing) return;
    setSyncing(true);
    setLiveStatus(`// syncing ${syncableConnected.length} platforms…`);

    // Kick off every sync in parallel — the route is fire-and-forget so each
    // call returns ~immediately after marking the platform as 'syncing'.
    await Promise.all(
      syncableConnected.map((p) => api.syncPlatform(p.code).catch(() => null)),
    );

    // Poll until nothing is still 'syncing'. Cap at ~60s per platform.
    const maxAttempts = 30;
    let attempts = 0;
    while (attempts < maxAttempts) {
      attempts++;
      await new Promise((r) => setTimeout(r, 2000));
      const fresh = await refetch();
      const stillSyncing = fresh.filter((p) => p.syncStatus === 'syncing');
      if (stillSyncing.length === 0) break;
    }

    const final = await refetch();
    const errored = final.filter((p) => p.syncStatus === 'error');
    setLiveStatus(
      errored.length > 0
        ? `// done — ${errored.length} failed (${errored.map((p) => p.code).join(', ')})`
        : '// done — all platforms synced',
    );
    setSyncing(false);
    setTimeout(() => setLiveStatus(null), 6000);
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div>
          <Marker>// platforms · {platforms.length} connected</Marker>
          <div className="t-display" style={{ fontSize: "var(--text-xl)", marginTop: 8, color: 'var(--paper)', letterSpacing: '-0.01em' }}>
            platforms
          </div>
        </div>
        <Btn sm onClick={() => void handleSyncAll()} disabled={syncing || syncableConnected.length === 0}>
          <Icon name="refresh" size={11} /> {syncing ? 'syncing…' : 'sync all'}
        </Btn>
      </div>

      {liveStatus && (
        <div
          role="status"
          aria-live="polite"
          className="t-mono"
          style={{
            marginTop: 14,
            padding: '8px 12px',
            border: '1px solid var(--rule-bright)',
            color: liveStatus.includes('failed') ? 'var(--red)' : 'var(--paper-dim)',
            fontSize: 'var(--text-2xs)',
            letterSpacing: '0.1em',
          }}
        >
          {liveStatus}
        </div>
      )}

      <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {connected.map((meta) => {
          const detail = getDetail(meta.code);
          const rawStatus = detail?.syncStatus ?? 'ok';
          const status = (rawStatus === 'ok' ? 'connected' : rawStatus) as PlatConnectStatus;
          return (
            <PlatformRow
              key={meta.code}
              code={meta.code}
              name={meta.name}
              via={detail ? `${meta.via} · sync ${detail.lastSyncAt ? relativeTime(detail.lastSyncAt) : 'never'}` : meta.via}
              status={status}
              who={detail?.who ?? null}
              gameCount={detail?.gameCount ?? null}
              onManage={() => navigate(`/settings/platforms/${meta.code.toLowerCase()}`)}
            />
          );
        })}

        {available.length > 0 && (
          <>
            <div style={{ margin: '4px 0' }}><Hr kind="dot" /></div>
            <div className="t-mono t-faint" style={{ fontSize: "var(--text-3xs)", textTransform: 'uppercase', letterSpacing: '0.14em' }}>
              // available
            </div>
            {available.map((meta) => (
              <PlatformRow
                key={meta.code}
                code={meta.code}
                name={meta.name}
                via={meta.via}
                status={meta.syncable ? 'available' : 'unsupported'}
                who={null}
                gameCount={null}
                {...(meta.syncable ? { onManage: () => navigate(`/settings/platforms/${meta.code.toLowerCase()}`) } : {})}
              />
            ))}
          </>
        )}
      </div>
    </>
  );
}

interface PlatformRowProps {
  code: string;
  name: string;
  via: string;
  status: PlatConnectStatus;
  who: string | null;
  gameCount: number | null;
  onManage?: () => void;
}

function PlatformRow({ code, name, via, status, who, gameCount, onManage }: PlatformRowProps) {
  const isConnected = status === 'connected' || status === 'stale' || status === 'error' || status === 'syncing';
  return (
    <div className="panel" style={{ padding: 0 }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '32px 140px 1fr 180px 120px 90px',
        gap: 16,
        alignItems: 'center',
        padding: '14px 18px',
      }}>
        <Plat code={code} lg />
        <div>
          <div style={{ fontSize: "var(--text-sm)" }}>{name}</div>
          <PlatformDot status={status} />
        </div>
        <div className="t-mono t-faint" style={{ fontSize: "var(--text-2xs)" }}>
          {isConnected && who ? <>signed in as <span style={{ color: 'var(--paper)' }}>{who}</span> · {via}</> : via}
        </div>
        <div style={{ fontSize: "var(--text-2xs)", color: 'var(--paper-dim)' }}>
          {isConnected ? <>{gameCount ?? '—'} games</> : 'not connected'}
        </div>
        <div>
          {isConnected && (
            <span className="t-mono" style={{
              fontSize: "var(--text-3xs)",
              color: status === 'stale' ? 'var(--amber)' : status === 'error' ? 'var(--red)' : 'var(--green)',
            }}>
              {status === 'stale' ? '⚠ re-auth' : status === 'error' ? '✕ error' : '● healthy'}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
          {isConnected ? (
            <Btn sm {...(onManage ? { onClick: onManage } : {})}>
              manage <Icon name="caret" size={10} />
            </Btn>
          ) : status === 'unsupported' ? (
            <span className="t-faint" style={{ fontSize: "var(--text-3xs)" }}>manual only</span>
          ) : (
            <Btn sm variant="primary" {...(onManage ? { onClick: onManage } : {})}>
              connect
            </Btn>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Appearance section ── */

function AppearanceSection() {
  const { prefs, updatePref } = usePreferences();
  return (
    <>
      <Marker>// preferences · how hoard looks &amp; behaves</Marker>
      <div className="t-display" style={{ fontSize: "var(--text-xl)", marginTop: 8, color: 'var(--paper)', letterSpacing: '-0.01em' }}>
        preferences
      </div>
      <div className="t-mono t-faint" style={{ fontSize: "var(--text-2xs)", marginTop: 4 }}>
        all changes apply instantly · synced across devices.
      </div>

      <div style={{ marginTop: 28 }}>
        <SettingsRow label="theme" hint="dark mode is the only option in v1. light mode is planned.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Radio on={true} label="dark" sub="// the way it's meant to be played" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', opacity: 0.45 }}>
              <span style={{ width: 12, height: 12, border: '1px dashed var(--paper-faint)', display: 'inline-block' }} />
              <div><div style={{ fontSize: "var(--text-xs)", color: 'var(--paper-dim)' }}>light <span className="t-faint" style={{ marginLeft: 6, fontSize: "var(--text-3xs)", color: 'var(--amber)', letterSpacing: '0.1em' }}>// v2</span></div></div>
            </div>
            <Radio on={false} label="auto" sub="// follows system · also v2" />
          </div>
        </SettingsRow>

        {/* "default library view" row removed in PR A (D5): grid + list
            layouts were never built. The User.libraryView column is kept in
            the schema as a no-op default to avoid a migration. */}

        <SettingsRow label="show HLTB estimates" hint="how-long-to-beat times under backlog covers and on the dashboard.">
          <Toggle
            on={prefs.showHltb}
            label={prefs.showHltb ? 'enabled' : 'disabled'}
            sub="data via howlongtobeat.com · cached locally"
            onClick={() => void updatePref({ showHltb: !prefs.showHltb })}
          />
        </SettingsRow>

        <SettingsRow label="cover density" hint="how tightly covers pack on shelves and grids.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Radio on={prefs.coverDensity === 'cozy'}     label="cozy"     onClick={() => void updatePref({ coverDensity: 'cozy' })} />
            <Radio on={prefs.coverDensity === 'standard'} label="standard" onClick={() => void updatePref({ coverDensity: 'standard' })} />
            <Radio on={prefs.coverDensity === 'dense'}    label="dense"    sub="fits ~30% more · smaller covers" onClick={() => void updatePref({ coverDensity: 'dense' })} />
          </div>
        </SettingsRow>

        <SettingsRow label="terminal cursor" hint="blinking cursor after // markers.">
          <Toggle
            on={prefs.terminalCursor}
            label={prefs.terminalCursor ? 'blinking' : 'off'}
            sub="2-second cycle, paused on idle"
            onClick={() => void updatePref({ terminalCursor: !prefs.terminalCursor })}
          />
        </SettingsRow>

        <SettingsRow label="upcoming hype filter" hint="minimum IGDB hype count for the upcoming releases feed. lower = more results including obscure titles.">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              className="btn sm"
              onClick={() => void updatePref({ hypeThreshold: Math.max(0, prefs.hypeThreshold - 1) })}
              style={{ width: 26, height: 26, padding: 0, fontSize: "var(--text-base)", lineHeight: 1 }}
            >−</button>
            <span className="t-mono t-tnum" style={{ fontSize: "var(--text-md)", minWidth: 28, textAlign: 'center' }}>{prefs.hypeThreshold}</span>
            <button
              className="btn sm"
              onClick={() => void updatePref({ hypeThreshold: Math.min(100, prefs.hypeThreshold + 1) })}
              style={{ width: 26, height: 26, padding: 0, fontSize: "var(--text-base)", lineHeight: 1 }}
            >+</button>
            <span className="t-faint" style={{ fontSize: "var(--text-3xs)" }}>default 5 · 0 = no filter</span>
          </div>
        </SettingsRow>
      </div>
    </>
  );
}

/* ── Danger zone section ── */

function DangerSection({ user }: { user: AuthUser | null }) {
  const navigate = useNavigate();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showWipeModal, setShowWipeModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [wipeConfirm, setWipeConfirm] = useState('');
  const [working, setWorking] = useState<null | 'delete' | 'wipe'>(null);
  const [wipeResult, setWipeResult] = useState<string | null>(null);

  async function handleDelete() {
    setWorking('delete');
    try {
      await api.deleteAccount();
      navigate('/login');
    } catch {
      setWorking(null);
    }
  }

  async function handleWipe() {
    setWorking('wipe');
    try {
      const r = await api.wipeLibrary();
      setShowWipeModal(false);
      setWipeConfirm('');
      setWipeResult(`// ${r.gamesDeleted} games removed · ${r.platformsDisconnected} platforms disconnected`);
      // Auto-clear the toast after a few seconds
      setTimeout(() => setWipeResult(null), 5000);
    } catch {
      // leave modal open — user can retry or cancel
    } finally {
      setWorking(null);
    }
  }

  return (
    <>
      <Marker>// danger zone</Marker>
      <div className="t-display" style={{ fontSize: "var(--text-xl)", marginTop: 8, color: 'var(--red)' }}>
        danger zone
      </div>
      <div className="t-mono t-faint" style={{ fontSize: "var(--text-2xs)", marginTop: 4 }}>
        irreversible actions. read carefully.
      </div>

      {wipeResult && (
        <div role="status" aria-live="polite" className="t-mono" style={{ marginTop: 18, padding: '10px 14px', border: '1px solid var(--green)', color: 'var(--green)', fontSize: 'var(--text-2xs)', letterSpacing: '0.1em' }}>
          {wipeResult}
        </div>
      )}

      <div style={{ marginTop: 28 }}>
        <SettingsRow
          label="wipe library"
          hint="delete all tracked games, statuses, ratings, and notes. disconnects every platform. wishlist, account, and preferences stay."
          danger
        >
          <Btn sm style={{ color: 'var(--red)', borderColor: 'var(--red)' }} onClick={() => setShowWipeModal(true)}>
            <Icon name="trash" size={10} /> wipe library
          </Btn>
        </SettingsRow>

        <SettingsRow
          label="delete account"
          hint="permanently erases your account and all data. cannot be undone."
          danger
        >
          <Btn sm style={{ color: 'var(--red)', borderColor: 'var(--red)' }} onClick={() => setShowDeleteModal(true)}>
            <Icon name="trash" size={10} /> delete account
          </Btn>
        </SettingsRow>
      </div>

      {showDeleteModal && (
        <ConfirmModal
          variant="delete-account"
          subject={user?.name ?? 'your account'}
          confirmKeyword="HOARD"
          confirmText={deleteConfirm}
          working={working === 'delete'}
          onTextChange={setDeleteConfirm}
          onConfirm={() => void handleDelete()}
          onCancel={() => { setShowDeleteModal(false); setDeleteConfirm(''); }}
        />
      )}

      {showWipeModal && (
        <ConfirmModal
          variant="wipe-library"
          subject="your library"
          confirmKeyword="WIPE"
          confirmText={wipeConfirm}
          working={working === 'wipe'}
          onTextChange={setWipeConfirm}
          onConfirm={() => void handleWipe()}
          onCancel={() => { setShowWipeModal(false); setWipeConfirm(''); }}
        />
      )}
    </>
  );
}

/* ── Stub for sections not yet implemented (PR A — A6) ── */

const STUB_DESCRIPTIONS: Record<string, string> = {
  library: 'extra library defaults — cover density, default sort, HLTB display preferences. some controls already exist under Appearance.',
  notifications: 'in-app + email alerts when wishlisted releases approach launch and when scheduled syncs fail. opt-in only.',
  privacy: 'profile visibility, data sharing, anonymized usage telemetry. account deletion lives under danger zone today.',
  'data export': 'one-click export of your library, wishlist, and notes as JSON or CSV. import lives here too.',
};

function StubSection({ title }: { title: string }) {
  return (
    <>
      <Marker>// {title} <span style={{ marginLeft: 8, color: 'var(--amber)', letterSpacing: '0.1em' }}>v2</span></Marker>
      <div className="t-display" style={{ fontSize: "var(--text-xl)", marginTop: 8, color: 'var(--paper)', letterSpacing: '-0.01em' }}>
        {title}
      </div>
      <div className="panel" style={{ marginTop: 18, padding: 24 }}>
        <div className="t-mono" style={{ fontSize: 'var(--text-xs)', color: 'var(--amber)', letterSpacing: '0.1em' }}>// coming soon — v2</div>
        <p style={{ marginTop: 12, color: 'var(--paper-dim)', fontSize: 'var(--text-sm)', lineHeight: 1.55 }}>
          {STUB_DESCRIPTIONS[title] ?? 'this section is planned for a future release.'}
        </p>
      </div>
    </>
  );
}

/* ── helpers ── */

function relativeTime(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
