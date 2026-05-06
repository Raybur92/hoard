import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { MobileHeader } from '../layout/MobileHeader';
import { Toggle, Radio, PlatformDot } from '../settings';
import type { PlatConnectStatus } from '../settings';
import { Icon } from '../primitives/Icon';
import { Btn } from '../primitives/Btn';
import { Plat } from '../primitives/Plat';
import { api } from '../../lib/api';
import { useUser } from '../../contexts/UserContext';
import { usePreferences } from '../../contexts/PreferencesContext';
import type { PlatformDetail, PlatformCode } from '@hoard/types';

const MOBILE_PLATFORM_NAMES: Record<string, string> = {
  ST: 'Steam',
  PS: 'PSN',
  XB: 'Xbox',
  GG: 'GOG',
  NT: 'Nintendo',
  EP: 'Epic Games',
};

const TOP_SECTIONS = [
  { key: 'account',      label: 'account',       sub: 'andrea · andrea@lx-media.at', icon: 'user'     },
  { key: 'platforms',    label: 'platforms',      sub: '4 connected',                  icon: 'link'     },
  { key: 'library',      label: 'library',        sub: 'default sort',                 icon: 'menu'     },
  { key: 'notifications',label: 'notifications',  sub: 'release reminders on',         icon: 'bell'     },
  { key: 'appearance',   label: 'appearance',     sub: 'dark · standard density',      icon: 'cog'      },
  { key: 'privacy',      label: 'privacy',        sub: 'unlisted',                     icon: 'shield'   },
  { key: 'export',       label: 'data export',    sub: '',                             icon: 'download' },
  { key: 'danger',       label: 'danger zone',    sub: 'wipe library · delete account',icon: 'warn'     },
] as const;

export function SettingsMobile() {
  useDocumentTitle("Settings");
  const { section } = useParams<{ section: string }>();
  const navigate = useNavigate();
  const { user, setUser, signOut } = useUser();
  const [platforms, setPlatforms] = useState<PlatformDetail[]>([]);
  const [draftName, setDraftName] = useState('');
  const [draftEmail, setDraftEmail] = useState('');
  const [saved, setSaved] = useState<'name' | 'email' | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [wipeConfirm, setWipeConfirm] = useState('');
  const [wiping, setWiping] = useState(false);
  const [wipeResult, setWipeResult] = useState<string | null>(null);
  const { prefs, updatePref } = usePreferences();

  useEffect(() => {
    void api.platformStatus().then((r) => setPlatforms(r.platforms)).catch(() => null);
  }, []);

  useEffect(() => {
    if (user) {
      setDraftName(user.name ?? '');
      setDraftEmail(user.email ?? '');
    }
  }, [user]);

  async function saveField(field: 'name' | 'email', value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    const current = field === 'name' ? user?.name : user?.email;
    if (trimmed === current) return;
    try {
      const updated = await api.updateMe({ [field]: trimmed });
      setUser(updated);
      if (timerRef.current) clearTimeout(timerRef.current);
      setSaved(field);
      timerRef.current = setTimeout(() => setSaved(null), 2000);
    } catch { /* silently ignore */ }
  }

  // Top-level menu (no section selected)
  if (!section) {
    return (
      <>
        <MobileHeader title="settings" sub={`// ${user?.name ?? '…'} · v0.1`} />
        <div className="thin-scroll" style={{ flex: 1, overflow: 'auto' }}>
          <div style={{
            padding: '14px 16px 8px',
            display: 'flex', alignItems: 'center', gap: 12,
            borderBottom: '1px solid var(--rule)',
          }}>
            <div style={{ width: 44, height: 44, background: 'var(--ink-2)', border: '1px solid var(--rule-bright)' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "var(--text-base)" }}>{user?.name ?? '…'}</div>
              <div className="t-faint" style={{ fontSize: "var(--text-3xs)" }}>hoard.app/u/{user?.name ?? user?.id ?? '…'}</div>
            </div>
            <Btn sm onClick={() => navigate('/settings/account')}>edit</Btn>
          </div>
          <div>
            {TOP_SECTIONS.map(({ key, label, icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => navigate(`/settings/${key}`)}
                style={{
                  display: 'grid', gridTemplateColumns: '24px 1fr 12px', gap: 12,
                  padding: '14px 16px', alignItems: 'center',
                  borderBottom: '1px solid var(--rule)',
                  borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                  color: key === 'danger' ? 'var(--red)' : 'var(--paper)',
                  cursor: 'pointer',
                  background: 'transparent',
                  width: '100%',
                  textAlign: 'left',
                  font: 'inherit',
                }}
              >
                <Icon name={icon as Parameters<typeof Icon>[0]['name']} size={14} />
                <div>
                  <div style={{ fontSize: "var(--text-sm)" }}>{label}</div>
                </div>
                <Icon name="caret" size={11} style={{ transform: 'rotate(-90deg)' }} />
              </button>
            ))}
          </div>
          <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
            <span className="t-mono t-faint" style={{ fontSize: "var(--text-3xs)" }}>hoard v0.1</span>
            <button
              type="button"
              className="t-mono t-faint"
              style={{ fontSize: "var(--text-3xs)", cursor: 'pointer', background: 'transparent', border: 'none', padding: 4, font: 'inherit', color: 'inherit' }}
              onClick={() => { void signOut().then(() => navigate('/login')); }}
            >
              // sign out
            </button>
          </div>
        </div>
      </>
    );
  }

  // Section detail views
  const backHeader = (title: string, sub: string) => (
    <MobileHeader title={title} sub={sub} back />
  );

  if (section === 'account') {
    return (
      <>
        {backHeader('account', `// ${draftName || '…'}`)}
        <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '16px 16px 24px' }}>
          <div style={{ padding: '10px 0', borderBottom: '1px solid var(--rule)' }}>
            <div className="t-up t-faint" style={{ fontSize: "var(--text-2xs)" }}>// display name</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <input
                className="field"
                style={{ flex: 1, fontSize: "var(--text-xs)" }}
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={() => void saveField('name', draftName)}
                placeholder="display name"
              />
              {saved === 'name' && <span role="status" aria-live="polite" className="t-mono t-green" style={{ fontSize: "var(--text-3xs)" }}>ok</span>}
            </div>
          </div>
          <div style={{ padding: '10px 0', borderBottom: '1px solid var(--rule)' }}>
            <div className="t-up t-faint" style={{ fontSize: "var(--text-2xs)" }}>// email</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <input
                className="field"
                type="email"
                style={{ flex: 1, fontSize: "var(--text-xs)" }}
                value={draftEmail}
                onChange={(e) => setDraftEmail(e.target.value)}
                onBlur={() => void saveField('email', draftEmail)}
                placeholder="email address"
              />
              {saved === 'email'
                ? <span role="status" aria-live="polite" className="t-mono t-green" style={{ fontSize: "var(--text-3xs)" }}>ok</span>
                : <span className="chip" style={{ color: 'var(--green)', borderColor: 'var(--green)', fontSize: "var(--text-3xs)" }}>
                    <Icon name="check" size={9} /> ok
                  </span>
              }
            </div>
          </div>
          <div style={{ padding: '14px 0' }}>
            <Btn
              style={{ width: '100%' }}
              onClick={() => { void signOut().then(() => navigate('/login')); }}
            >
              <Icon name="x" size={11} /> sign out
            </Btn>
          </div>
        </div>
      </>
    );
  }

  if (section === 'platforms') {
    const connectedCodes = new Set(platforms.map((p) => p.code));
    return (
      <>
        {backHeader('platforms', `// ${platforms.length} connected`)}
        <div className="thin-scroll" style={{ flex: 1, overflow: 'auto' }}>
          {['ST', 'PS', 'XB', 'GG', 'NT', 'EP'].map((code) => {
            const detail = platforms.find((p) => p.code === code);
            const connected = connectedCodes.has(code as PlatformCode);
            const rawSyncStatus = detail?.syncStatus;
            const status: PlatConnectStatus = connected
              ? ((rawSyncStatus === 'ok' || !rawSyncStatus) ? 'connected' : rawSyncStatus as PlatConnectStatus)
              : code === 'NT' || code === 'EP' ? 'unsupported' : 'available';
            const fullName = MOBILE_PLATFORM_NAMES[code] ?? code;
            const gameCount = detail?.gameCount ?? null;
            const lastSyncStr = detail?.lastSyncAt ? relativeTime(detail.lastSyncAt) : null;
            // Compose detail line: game count + last sync, or 'not connected'
            const detailLine = connected
              ? [
                  gameCount != null ? `${gameCount} games` : null,
                  lastSyncStr ? `synced ${lastSyncStr}` : 'never synced',
                ].filter(Boolean).join(' · ')
              : 'not connected';
            const rowStyle = { display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--rule)', alignItems: 'center' } as const;
            const inner = (
              <>
                <Plat code={code} lg />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "var(--text-sm)" }}>{fullName}</div>
                  <div className="t-faint" style={{ fontSize: "var(--text-3xs)", marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {detailLine}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <PlatformDot status={status} />
                  {!connected && status !== 'unsupported' && (
                    <Btn sm variant="primary" onClick={() => navigate(`/settings/platforms/${code.toLowerCase()}`)}>
                      connect
                    </Btn>
                  )}
                </div>
              </>
            );
            return connected ? (
              <button
                key={code}
                type="button"
                onClick={() => navigate(`/settings/platforms/${code.toLowerCase()}`)}
                style={{ ...rowStyle, background: 'transparent', borderTop: 'none', borderLeft: 'none', borderRight: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit' }}
              >
                {inner}
              </button>
            ) : (
              <div key={code} style={rowStyle}>
                {inner}
              </div>
            );
          })}
        </div>
      </>
    );
  }

  if (section === 'appearance') {
    return (
      <>
        {backHeader('appearance', '// preferences')}
        <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '12px 16px 24px' }}>
          <div style={{ padding: '10px 0', borderBottom: '1px solid var(--rule)' }}>
            <div className="t-up t-faint" style={{ fontSize: "var(--text-2xs)" }}>// theme</div>
            <div style={{ marginTop: 8 }}>
              <Radio on={true} label="dark" sub="default" />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', opacity: 0.45 }}>
                <span style={{ width: 12, height: 12, border: '1px dashed var(--paper-faint)', display: 'inline-block' }} />
                <div style={{ fontSize: "var(--text-xs)", color: 'var(--paper-dim)' }}>
                  light <span style={{ marginLeft: 6, fontSize: "var(--text-3xs)", color: 'var(--amber)', letterSpacing: '0.1em' }}>// v2</span>
                </div>
              </div>
            </div>
          </div>
          {/* "default library view" row removed in PR A (D5): grid + list
              layouts were never built. User.libraryView column kept as no-op. */}
          <div style={{ padding: '14px 0', borderBottom: '1px solid var(--rule)' }}>
            <div className="t-up t-faint" style={{ fontSize: "var(--text-2xs)" }}>// show HLTB estimates</div>
            <div style={{ marginTop: 10 }}>
              <Toggle
                on={prefs.showHltb}
                label={prefs.showHltb ? 'enabled' : 'disabled'}
                sub="data via howlongtobeat.com"
                onClick={() => void updatePref({ showHltb: !prefs.showHltb })}
              />
            </div>
          </div>
          <div style={{ padding: '14px 0', borderBottom: '1px solid var(--rule)' }}>
            <div className="t-up t-faint" style={{ fontSize: "var(--text-2xs)" }}>// cover density</div>
            <div style={{ marginTop: 8 }}>
              <Radio on={prefs.coverDensity === 'cozy'}     label="cozy"     onClick={() => void updatePref({ coverDensity: 'cozy' })} />
              <Radio on={prefs.coverDensity === 'standard'} label="standard" onClick={() => void updatePref({ coverDensity: 'standard' })} />
              <Radio on={prefs.coverDensity === 'dense'}    label="dense"    sub="~30% more covers" onClick={() => void updatePref({ coverDensity: 'dense' })} />
            </div>
          </div>
          <div style={{ padding: '14px 0', borderBottom: '1px solid var(--rule)' }}>
            <div className="t-up t-faint" style={{ fontSize: "var(--text-2xs)" }}>// terminal cursor</div>
            <div style={{ marginTop: 10 }}>
              <Toggle
                on={prefs.terminalCursor}
                label={prefs.terminalCursor ? 'blinking' : 'off'}
                sub="2-second cycle, paused on idle"
                onClick={() => void updatePref({ terminalCursor: !prefs.terminalCursor })}
              />
            </div>
          </div>
          <div style={{ padding: '14px 0' }}>
            <div className="t-up t-faint" style={{ fontSize: "var(--text-2xs)" }}>// upcoming hype filter</div>
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                className="btn sm"
                onClick={() => void updatePref({ hypeThreshold: Math.max(0, prefs.hypeThreshold - 1) })}
                style={{ width: 28, height: 28, padding: 0, fontSize: "var(--text-base)", lineHeight: 1 }}
              >−</button>
              <span className="t-mono t-tnum" style={{ fontSize: "var(--text-md)", minWidth: 28, textAlign: 'center' }}>{prefs.hypeThreshold}</span>
              <button
                className="btn sm"
                onClick={() => void updatePref({ hypeThreshold: Math.min(100, prefs.hypeThreshold + 1) })}
                style={{ width: 28, height: 28, padding: 0, fontSize: "var(--text-base)", lineHeight: 1 }}
              >+</button>
              <span className="t-faint" style={{ fontSize: "var(--text-3xs)" }}>0 = no filter</span>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (section === 'danger') {
    const deleteReady = deleteConfirm === 'HOARD';
    const wipeReady = wipeConfirm === 'WIPE';

    async function handleDelete() {
      setDeleting(true);
      try {
        await api.deleteAccount();
        navigate('/login');
      } catch {
        setDeleting(false);
      }
    }

    async function handleWipe() {
      setWiping(true);
      try {
        const r = await api.wipeLibrary();
        setWipeConfirm('');
        setWipeResult(`// ${r.gamesDeleted} games removed · ${r.platformsDisconnected} platforms disconnected`);
        setTimeout(() => setWipeResult(null), 5000);
      } catch { /* leave editor visible — user can retry */ }
      setWiping(false);
    }

    return (
      <>
        {backHeader('danger zone', '// settings')}
        <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '16px 16px 24px' }}>
          {wipeResult && (
            <div role="status" aria-live="polite" className="t-mono" style={{ marginBottom: 14, padding: '8px 12px', border: '1px solid var(--green)', color: 'var(--green)', fontSize: 'var(--text-3xs)', letterSpacing: '0.1em' }}>
              {wipeResult}
            </div>
          )}
          <div style={{ padding: '14px 0', borderBottom: '1px solid var(--rule)' }}>
            <div style={{ fontSize: "var(--text-sm)", color: 'var(--red)' }}>wipe library</div>
            <div className="t-faint" style={{ fontSize: "var(--text-2xs)", marginTop: 4, lineHeight: 1.4 }}>
              delete every tracked game and disconnect every platform. wishlist, account, and preferences stay.
            </div>
            <div className="t-up t-faint" style={{ fontSize: "var(--text-2xs)", marginTop: 14 }}>
              // type <span style={{ color: 'var(--red)' }}>WIPE</span> to confirm
            </div>
            <input
              className="field"
              style={{ marginTop: 8, fontSize: "var(--text-sm)", letterSpacing: '0.14em', width: '100%' }}
              value={wipeConfirm}
              onChange={(e) => setWipeConfirm(e.target.value.toUpperCase())}
              placeholder="WIPE"
              maxLength={4}
              aria-label="Type WIPE to confirm wiping the library"
            />
            <Btn
              sm
              style={{ marginTop: 10, color: 'var(--red)', borderColor: 'var(--red)', opacity: (wipeReady && !wiping) ? 1 : 0.4 }}
              {...(wipeReady && !wiping ? { onClick: () => void handleWipe() } : {})}
            >
              <Icon name="trash" size={10} /> {wiping ? 'wiping…' : 'wipe library'}
            </Btn>
          </div>
          <div style={{ padding: '14px 0' }}>
            <div style={{ fontSize: "var(--text-sm)", color: 'var(--red)' }}>delete account</div>
            <div className="t-faint" style={{ fontSize: "var(--text-2xs)", marginTop: 4, lineHeight: 1.4 }}>
              permanently erases your account and all data. cannot be undone.
            </div>
            <div className="t-up t-faint" style={{ fontSize: "var(--text-2xs)", marginTop: 14 }}>
              // type <span style={{ color: 'var(--red)' }}>HOARD</span> to confirm
            </div>
            <input
              className="field"
              style={{ marginTop: 8, fontSize: "var(--text-sm)", letterSpacing: '0.14em', width: '100%' }}
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value.toUpperCase())}
              placeholder="HOARD"
              maxLength={5}
            />
            <Btn
              sm
              style={{ marginTop: 10, color: 'var(--red)', borderColor: 'var(--red)', opacity: (deleteReady && !deleting) ? 1 : 0.4 }}
              {...(deleteReady && !deleting ? { onClick: () => void handleDelete() } : {})}
            >
              <Icon name="trash" size={10} /> {deleting ? 'deleting…' : 'delete forever'}
            </Btn>
          </div>
        </div>
      </>
    );
  }

  // Coming-soon stub for sections deferred to v2 (PR A — A6).
  const stubDescriptions: Record<string, string> = {
    library: 'extra library defaults — cover density, default sort, HLTB display preferences. some controls already exist under Appearance.',
    notifications: 'in-app + email alerts when wishlisted releases approach launch and when scheduled syncs fail. opt-in only.',
    privacy: 'profile visibility, data sharing, anonymized usage telemetry. account deletion lives under danger zone today.',
    export: 'one-click export of your library, wishlist, and notes as JSON or CSV. import lives here too.',
  };
  const stubTitle = section === 'export' ? 'data export' : section;
  return (
    <>
      {backHeader(stubTitle, '// settings')}
      <div style={{ padding: 16 }}>
        <div className="panel" style={{ padding: 18 }}>
          <div className="t-mono" style={{ fontSize: 'var(--text-xs)', color: 'var(--amber)', letterSpacing: '0.1em' }}>// coming soon — v2</div>
          <p style={{ marginTop: 10, color: 'var(--paper-dim)', fontSize: 'var(--text-xs)', lineHeight: 1.55 }}>
            {stubDescriptions[section] ?? 'this section is planned for a future release.'}
          </p>
        </div>
      </div>
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
