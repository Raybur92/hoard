import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MobileHeader } from '../layout/MobileHeader';
import { Toggle, Radio, PlatformDot } from '../settings';
import type { PlatConnectStatus } from '../settings';
import { Icon } from '../primitives/Icon';
import { Btn } from '../primitives/Btn';
import { Marker } from '../primitives/Marker';
import { Plat } from '../primitives/Plat';
import { api } from '../../lib/api';
import { useUser } from '../../contexts/UserContext';
import { usePreferences } from '../../contexts/PreferencesContext';
import type { PlatformDetail, PlatformCode } from '@hoard/types';

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
              <div style={{ fontSize: 14 }}>{user?.name ?? '…'}</div>
              <div className="t-faint" style={{ fontSize: 10 }}>hoard.app/u/{user?.name ?? user?.id ?? '…'}</div>
            </div>
            <Btn sm onClick={() => navigate('/settings/account')}>edit</Btn>
          </div>
          <div>
            {TOP_SECTIONS.map(({ key, label, icon }) => (
              <div
                key={key}
                onClick={() => navigate(`/settings/${key}`)}
                style={{
                  display: 'grid', gridTemplateColumns: '24px 1fr 12px', gap: 12,
                  padding: '14px 16px', alignItems: 'center',
                  borderBottom: '1px solid var(--rule)',
                  color: key === 'danger' ? 'var(--red)' : 'var(--paper)',
                  cursor: 'pointer',
                }}
              >
                <Icon name={icon as Parameters<typeof Icon>[0]['name']} size={14} />
                <div>
                  <div style={{ fontSize: 13 }}>{label}</div>
                </div>
                <Icon name="caret" size={11} style={{ transform: 'rotate(-90deg)' }} />
              </div>
            ))}
          </div>
          <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
            <span className="t-mono t-faint" style={{ fontSize: 10 }}>hoard v0.1</span>
            <span
              className="t-mono t-faint"
              style={{ fontSize: 10, cursor: 'pointer' }}
              onClick={() => { void signOut().then(() => navigate('/login')); }}
            >
              // sign out
            </span>
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
            <div className="t-up t-faint" style={{ fontSize: 9 }}>// display name</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <input
                className="field"
                style={{ flex: 1, fontSize: 12 }}
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={() => void saveField('name', draftName)}
                placeholder="display name"
              />
              {saved === 'name' && <span className="t-mono t-green" style={{ fontSize: 10 }}>ok</span>}
            </div>
          </div>
          <div style={{ padding: '10px 0', borderBottom: '1px solid var(--rule)' }}>
            <div className="t-up t-faint" style={{ fontSize: 9 }}>// email</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <input
                className="field"
                type="email"
                style={{ flex: 1, fontSize: 12 }}
                value={draftEmail}
                onChange={(e) => setDraftEmail(e.target.value)}
                onBlur={() => void saveField('email', draftEmail)}
                placeholder="email address"
              />
              {saved === 'email'
                ? <span className="t-mono t-green" style={{ fontSize: 10 }}>ok</span>
                : <span className="chip" style={{ color: 'var(--green)', borderColor: 'var(--green)', fontSize: 10 }}>
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
            return (
              <div
                key={code}
                style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--rule)', alignItems: 'center' }}
                onClick={connected ? () => navigate(`/settings/platforms/${code.toLowerCase()}`) : undefined}
              >
                <Plat code={code} lg />
                <div>
                  <div style={{ fontSize: 13 }}>{code}</div>
                  <div className="t-faint" style={{ fontSize: 10, marginTop: 2 }}>
                    {connected ? `${detail?.who ?? ''} · sync ${detail?.lastSyncAt ? relativeTime(detail.lastSyncAt) : 'never'}` : 'not connected'}
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
            <div className="t-up t-faint" style={{ fontSize: 9 }}>// theme</div>
            <div style={{ marginTop: 8 }}>
              <Radio on={true} label="dark" sub="default" />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', opacity: 0.45 }}>
                <span style={{ width: 12, height: 12, border: '1px dashed var(--paper-faint)', display: 'inline-block' }} />
                <div style={{ fontSize: 12, color: 'var(--paper-dim)' }}>
                  light <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--amber)', letterSpacing: '0.1em' }}>// v2</span>
                </div>
              </div>
            </div>
          </div>
          <div style={{ padding: '14px 0', borderBottom: '1px solid var(--rule)' }}>
            <div className="t-up t-faint" style={{ fontSize: 9 }}>// default library view</div>
            <div style={{ marginTop: 8 }}>
              <Radio on={prefs.libraryView === 'shelves'} label="shelves" sub="grouped by status"   onClick={() => void updatePref({ libraryView: 'shelves' })} />
              <Radio on={prefs.libraryView === 'grid'}    label="grid"    sub="all covers, dense"   onClick={() => void updatePref({ libraryView: 'grid' })} />
              <Radio on={prefs.libraryView === 'list'}    label="list"    sub="rows · power users"  onClick={() => void updatePref({ libraryView: 'list' })} />
            </div>
          </div>
          <div style={{ padding: '14px 0', borderBottom: '1px solid var(--rule)' }}>
            <div className="t-up t-faint" style={{ fontSize: 9 }}>// show HLTB estimates</div>
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
            <div className="t-up t-faint" style={{ fontSize: 9 }}>// cover density</div>
            <div style={{ marginTop: 8 }}>
              <Radio on={prefs.coverDensity === 'cozy'}     label="cozy"     onClick={() => void updatePref({ coverDensity: 'cozy' })} />
              <Radio on={prefs.coverDensity === 'standard'} label="standard" onClick={() => void updatePref({ coverDensity: 'standard' })} />
              <Radio on={prefs.coverDensity === 'dense'}    label="dense"    sub="~30% more covers" onClick={() => void updatePref({ coverDensity: 'dense' })} />
            </div>
          </div>
          <div style={{ padding: '14px 0', borderBottom: '1px solid var(--rule)' }}>
            <div className="t-up t-faint" style={{ fontSize: 9 }}>// terminal cursor</div>
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
            <div className="t-up t-faint" style={{ fontSize: 9 }}>// upcoming hype filter</div>
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                className="btn sm"
                onClick={() => void updatePref({ hypeThreshold: Math.max(0, prefs.hypeThreshold - 1) })}
                style={{ width: 28, height: 28, padding: 0, fontSize: 14, lineHeight: 1 }}
              >−</button>
              <span className="t-mono t-tnum" style={{ fontSize: 16, minWidth: 28, textAlign: 'center' }}>{prefs.hypeThreshold}</span>
              <button
                className="btn sm"
                onClick={() => void updatePref({ hypeThreshold: Math.min(100, prefs.hypeThreshold + 1) })}
                style={{ width: 28, height: 28, padding: 0, fontSize: 14, lineHeight: 1 }}
              >+</button>
              <span className="t-faint" style={{ fontSize: 10 }}>0 = no filter</span>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (section === 'danger') {
    const deleteReady = deleteConfirm === 'HOARD';

    async function handleDelete() {
      setDeleting(true);
      try {
        await api.deleteAccount();
        navigate('/login');
      } catch {
        setDeleting(false);
      }
    }

    return (
      <>
        {backHeader('danger zone', '// settings')}
        <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '16px 16px 24px' }}>
          <div style={{ padding: '14px 0', borderBottom: '1px solid var(--rule)' }}>
            <div style={{ fontSize: 13, color: 'var(--red)' }}>wipe library</div>
            <div className="t-faint" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.4 }}>
              delete all tracked games and statuses. platform connections stay.
            </div>
            <Btn sm style={{ marginTop: 10, color: 'var(--red)', borderColor: 'var(--red)' }}>
              <Icon name="trash" size={10} /> wipe library
            </Btn>
          </div>
          <div style={{ padding: '14px 0' }}>
            <div style={{ fontSize: 13, color: 'var(--red)' }}>delete account</div>
            <div className="t-faint" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.4 }}>
              permanently erases your account and all data. cannot be undone.
            </div>
            <div className="t-up t-faint" style={{ fontSize: 9, marginTop: 14 }}>
              // type <span style={{ color: 'var(--red)' }}>HOARD</span> to confirm
            </div>
            <input
              className="field"
              style={{ marginTop: 8, fontSize: 13, letterSpacing: '0.14em', width: '100%' }}
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

  // Generic stub for other sections
  return (
    <>
      {backHeader(section, '// settings')}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Marker>// coming soon</Marker>
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
