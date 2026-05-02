import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Sidebar } from '../layout/Sidebar';
import { TopBar } from '../layout/TopBar';
import { SettingsNav, SettingsRow, Toggle, Radio, PlatformDot } from '../settings';
import type { SettingsSection, PlatConnectStatus } from '../settings';
import { Icon } from '../primitives/Icon';
import { Btn } from '../primitives/Btn';
import { Marker } from '../primitives/Marker';
import { Plat } from '../primitives/Plat';
import { Hr } from '../primitives/Hr';
import { api } from '../../lib/api';
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
  const { section: rawSection } = useParams<{ section: string }>();
  const section = resolveSection(rawSection);
  const navSection = SECTION_TO_NAV[section] ?? 'Account';
  const crumbLabel = SECTION_LABELS[section] ?? section;

  const [user, setUser] = useState<AuthUser | null>(null);
  const [platforms, setPlatforms] = useState<PlatformDetail[]>([]);

  useEffect(() => {
    void api.me().then((r) => setUser(r)).catch(() => null);
    void api.platformStatus().then((r) => setPlatforms(r.platforms)).catch(() => null);
  }, []);

  return (
    <div className="hoard-screen hoard-noise" style={{ width: '100%', height: '100%', display: 'flex' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar crumbs={['hoard', 'settings', crumbLabel]} />
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <SettingsNav active={navSection} />
          <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '28px 40px 40px', maxWidth: 880 }}>
            {section === 'account'       && <AccountSection user={user} />}
            {section === 'platforms'     && <PlatformsSection platforms={platforms} />}
            {section === 'appearance'    && <AppearanceSection />}
            {section === 'danger'        && <DangerSection user={user} />}
            {section === 'library'       && <StubSection title="library" />}
            {section === 'notifications' && <StubSection title="notifications" />}
            {section === 'privacy'       && <StubSection title="privacy" />}
            {section === 'export'        && <StubSection title="data export" />}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Account section ── */

function AccountSection({ user }: { user: AuthUser | null }) {
  return (
    <>
      <Marker>// account · {user?.name ?? 'loading…'}</Marker>
      <div className="t-display" style={{ fontSize: 28, marginTop: 8, color: 'var(--paper)', letterSpacing: '-0.01em' }}>
        account
      </div>
      <div className="t-mono t-faint" style={{ fontSize: 11, marginTop: 4 }}>
        member since {user ? new Date(user.createdAt).getFullYear() : '…'}
      </div>

      <div style={{ marginTop: 28 }}>
        <SettingsRow label="display name" hint="shown on your profile and shared receipts.">
          <div className="field" style={{ width: 320 }}>{user?.name ?? '…'}</div>
        </SettingsRow>

        <SettingsRow label="email" hint="used for sign-in, magic links, and digest emails.">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div className="field" style={{ width: 320 }}>{user?.email ?? '…'}</div>
            <span className="chip" style={{ color: 'var(--green)', borderColor: 'var(--green)' }}>
              <Icon name="check" size={10} /> verified
            </span>
          </div>
        </SettingsRow>

        <SettingsRow label="profile visibility" hint="who can see your library, stats, and notes.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Radio on={false} label="public"   sub="anyone with the link" />
            <Radio on={true}  label="unlisted" sub="link required — not indexed" />
            <Radio on={false} label="private"  sub="only you, signed in" />
          </div>
        </SettingsRow>

        <SettingsRow label="session" hint="active devices with hoard signed in.">
          <pre className="ascii t-dim" style={{ fontSize: 11, lineHeight: 1.7, margin: 0 }}>
{`▸ this browser     · active now
  Hoard PWA        · last seen 2h ago
  Safari · macOS   · last seen 4d ago   [revoke]`}
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

function PlatformsSection({ platforms }: { platforms: PlatformDetail[] }) {
  const navigate = useNavigate();
  const connectedCodes = new Set(platforms.map((p) => p.code));

  const connected = PLATFORM_META.filter((m) => connectedCodes.has(m.code as PlatformCode));
  const available = PLATFORM_META.filter((m) => !connectedCodes.has(m.code as PlatformCode));

  const getDetail = (code: string) => platforms.find((p) => p.code === code);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div>
          <Marker>// platforms · {platforms.length} connected</Marker>
          <div className="t-display" style={{ fontSize: 28, marginTop: 8, color: 'var(--paper)', letterSpacing: '-0.01em' }}>
            platforms
          </div>
        </div>
        <Btn sm><Icon name="refresh" size={11} /> sync all</Btn>
      </div>

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
            <div className="t-mono t-faint" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em' }}>
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
          <div style={{ fontSize: 13 }}>{name}</div>
          <PlatformDot status={status} />
        </div>
        <div className="t-mono t-faint" style={{ fontSize: 11 }}>
          {isConnected && who ? <>signed in as <span style={{ color: 'var(--paper)' }}>{who}</span> · {via}</> : via}
        </div>
        <div style={{ fontSize: 11, color: 'var(--paper-dim)' }}>
          {isConnected ? <>{gameCount ?? '—'} games</> : 'not connected'}
        </div>
        <div>
          {isConnected && (
            <span className="t-mono" style={{
              fontSize: 10,
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
            <span className="t-faint" style={{ fontSize: 10 }}>manual only</span>
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
  return (
    <>
      <Marker>// preferences · how hoard looks &amp; behaves</Marker>
      <div className="t-display" style={{ fontSize: 28, marginTop: 8, color: 'var(--paper)', letterSpacing: '-0.01em' }}>
        preferences
      </div>
      <div className="t-mono t-faint" style={{ fontSize: 11, marginTop: 4 }}>
        all changes apply instantly · resets stored per-device.
      </div>

      <div style={{ marginTop: 28 }}>
        <SettingsRow label="theme" hint="dark mode is the only option in v1. light mode is planned.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Radio on={true}  label="dark"  sub="// the way it's meant to be played" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', opacity: 0.45 }}>
              <span style={{ width: 12, height: 12, border: '1px dashed var(--paper-faint)', display: 'inline-block' }} />
              <div>
                <div style={{ fontSize: 12, color: 'var(--paper-dim)' }}>
                  light <span className="t-faint" style={{ marginLeft: 6, fontSize: 10, color: 'var(--amber)', letterSpacing: '0.1em' }}>// v2</span>
                </div>
              </div>
            </div>
            <Radio on={false} label="auto"  sub="// follows system · also v2" />
          </div>
        </SettingsRow>

        <SettingsRow label="default library view" hint="what /library opens to by default.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Radio on={true}  label="shelves" sub="grouped by status" />
            <Radio on={false} label="grid"    sub="all covers, dense" />
            <Radio on={false} label="table"   sub="rows · for power users" />
          </div>
        </SettingsRow>

        <SettingsRow label="show HLTB estimates" hint="how-long-to-beat times under backlog covers and on the dashboard.">
          <Toggle on={true} label="enabled" sub="data via howlongtobeat.com · cached locally" />
        </SettingsRow>

        <SettingsRow label="cover density" hint="how tightly covers pack on shelves and grids.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Radio on={false} label="cozy" />
            <Radio on={true}  label="standard" />
            <Radio on={false} label="dense" sub="fits ~30% more · smaller covers" />
          </div>
        </SettingsRow>

        <SettingsRow label="terminal cursor" hint="blinking cursor after // markers.">
          <Toggle on={true} label="blinking" sub="2-second cycle, paused on idle" />
        </SettingsRow>
      </div>
    </>
  );
}

/* ── Danger zone section ── */

function DangerSection({ user }: { user: AuthUser | null }) {
  const [confirmText, setConfirmText] = useState('');
  const [showModal, setShowModal] = useState(false);
  const confirmed = confirmText === 'HOARD';

  return (
    <>
      <Marker>// danger zone</Marker>
      <div className="t-display" style={{ fontSize: 28, marginTop: 8, color: 'var(--red)' }}>
        danger zone
      </div>
      <div className="t-mono t-faint" style={{ fontSize: 11, marginTop: 4 }}>
        irreversible actions. read carefully.
      </div>

      <div style={{ marginTop: 28 }}>
        <SettingsRow
          label="wipe library"
          hint="delete all tracked games, statuses, ratings, and notes. platform connections stay."
          danger
        >
          <Btn sm style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>
            <Icon name="trash" size={10} /> wipe library
          </Btn>
        </SettingsRow>

        <SettingsRow
          label="delete account"
          hint="permanently erases your account and all data. cannot be undone."
          danger
        >
          <Btn sm style={{ color: 'var(--red)', borderColor: 'var(--red)' }} onClick={() => setShowModal(true)}>
            <Icon name="trash" size={10} /> delete account
          </Btn>
        </SettingsRow>
      </div>

      {showModal && (
        <DeleteModal
          userName={user?.name ?? 'your account'}
          confirmText={confirmText}
          confirmed={confirmed}
          onTextChange={setConfirmText}
          onCancel={() => { setShowModal(false); setConfirmText(''); }}
        />
      )}
    </>
  );
}

interface DeleteModalProps {
  userName: string;
  confirmText: string;
  confirmed: boolean;
  onTextChange: (v: string) => void;
  onCancel: () => void;
}

function DeleteModal({ userName, confirmText, confirmed, onTextChange, onCancel }: DeleteModalProps) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(8,9,10,0.72)' }} onClick={onCancel} />
      <div className="panel" style={{
        position: 'relative',
        width: 560,
        padding: 0,
        background: 'var(--ink)',
        borderColor: 'var(--red)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        zIndex: 1,
      }}>
        <div style={{
          height: 18,
          background: 'repeating-linear-gradient(135deg, var(--red) 0 8px, var(--ink) 8px 16px)',
          opacity: 0.6,
        }} />
        <div style={{ padding: '24px 28px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="warn" size={18} style={{ color: 'var(--red)' }} />
            <span className="t-up" style={{ fontSize: 11, letterSpacing: '0.16em', color: 'var(--red)' }}>
              // destructive · permanent · cannot be undone
            </span>
          </div>
          <div className="t-display" style={{ fontSize: 26, marginTop: 14, color: 'var(--paper)', letterSpacing: '-0.01em', lineHeight: 1.1 }}>
            delete {userName}<br />and everything in it.
          </div>
          <div style={{ marginTop: 16, fontSize: 12, color: 'var(--paper-dim)', lineHeight: 1.55 }}>
            this will permanently erase your hoard. there is no recovery, no soft-delete window, no support ticket that brings it back.
          </div>

          <div style={{ marginTop: 22 }}>
            <div className="t-up" style={{ fontSize: 10, letterSpacing: '0.12em', color: 'var(--paper-dim)' }}>
              // type <span style={{ color: 'var(--red)' }}>HOARD</span> to confirm
            </div>
            <input
              className="field"
              value={confirmText}
              onChange={(e) => onTextChange(e.target.value.toUpperCase())}
              style={{
                marginTop: 8,
                height: 38,
                fontSize: 14,
                fontFamily: 'var(--mono)',
                letterSpacing: '0.18em',
                borderColor: 'var(--red)',
                color: 'var(--paper)',
                width: '100%',
                background: 'var(--ink-2)',
                border: '1px solid var(--red)',
                padding: '0 12px',
                outline: 'none',
              }}
              placeholder="type HOARD"
              maxLength={5}
            />
            {confirmed && (
              <div className="t-faint" style={{ fontSize: 10, marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="check" size={10} style={{ color: 'var(--green)' }} /> matches · confirm unlocked
              </div>
            )}
          </div>

          <div style={{ marginTop: 22, display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              className="btn"
              onClick={onCancel}
              style={{ flex: 1, height: 44, fontSize: 12, background: 'var(--paper)', color: 'var(--void)', border: '1px solid var(--paper)' }}
            >
              <Icon name="back" size={12} style={{ color: 'var(--void)' }} /> cancel · keep my hoard
            </button>
            <button
              className="btn"
              disabled={!confirmed}
              style={{ height: 38, fontSize: 11, color: 'var(--red)', borderColor: 'var(--red)', background: 'transparent', opacity: confirmed ? 1 : 0.4 }}
            >
              <Icon name="trash" size={11} /> delete forever
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Stub for sections not yet implemented ── */

function StubSection({ title }: { title: string }) {
  return (
    <>
      <Marker>// {title}</Marker>
      <div className="t-display" style={{ fontSize: 28, marginTop: 8, color: 'var(--paper)', letterSpacing: '-0.01em' }}>
        {title}
      </div>
      <div className="t-mono t-faint" style={{ fontSize: 12, marginTop: 16 }}>
        // coming soon
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
