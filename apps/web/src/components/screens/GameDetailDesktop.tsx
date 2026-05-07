import { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { TopBar } from '../layout/TopBar';
import { Marker } from '../primitives/Marker';
import { Cover } from '../primitives/Cover';
import { Plat } from '../primitives/Plat';
import { Chip } from '../primitives/Chip';
import { Btn } from '../primitives/Btn';
import { Icon } from '../primitives/Icon';
import { Barcode } from '../primitives/Barcode';
import { useGame } from '../../hooks/useGame';
import { api } from '../../lib/api';
import { minutesToHours, formatRelative, shortYear, generateReceipt } from '../../lib/utils';
import type { GameStatus } from '@hoard/types';
import { RemapGameModal } from './RemapGameModal';

const STATUS_COLOR: Record<string, string> = {
  Playing: 'var(--green)',
  Backlog: 'var(--paper-faint)',
  Completed: 'var(--paper)',
  'On Hold': 'var(--blue)',
  Dropped: 'var(--red)',
  Wishlist: 'var(--amber)',
};

const ALL_STATUSES: GameStatus[] = ['Playing', 'Backlog', 'Completed', 'On Hold', 'Dropped', 'Wishlist'];

export function GameDetailDesktop() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: ug, loading, error, update, refetch } = useGame(id);
  useDocumentTitle(ug?.game.title ?? 'Game');
  const [statusOpen, setStatusOpen] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [remapOpen, setRemapOpen] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);

  // PR A — A9b: Dashboard "+ note" button navigates here with ?focus=notes
  // so the user lands directly in the editor. Runs once after the game loads.
  useEffect(() => {
    if (!ug) return;
    if (searchParams.get('focus') === 'notes' && !editingNotes) {
      setNoteDraft(ug.notes ?? '');
      setEditingNotes(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ug?.id]);

  useEffect(() => {
    if (!statusOpen) return;
    function handler(e: MouseEvent) {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) setStatusOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [statusOpen]);

  async function changeStatus(s: GameStatus) {
    if (!id) return;
    setStatusOpen(false);
    update({ status: s });
    await api.patchGame(id, { status: s }).catch(() => null);
  }

  async function saveNote() {
    if (!id) return;
    setEditingNotes(false);
    update({ notes: noteDraft || null });
    await api.patchGame(id, { notes: noteDraft || null }).catch(() => null);
  }

  if (loading || !ug) {
    return (
      <>
        <TopBar crumbs={['hoard', 'library', '…']} />
        {error
          ? <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 14 }}>
              <span className="t-mono t-red" style={{ fontSize: "var(--text-xs)" }}>{`// failed to load game`}</span>
              <span className="t-mono t-faint" style={{ fontSize: "var(--text-2xs)", maxWidth: 480, textAlign: 'center' }}>{error}</span>
              <Btn sm onClick={() => refetch()}>retry</Btn>
            </div>
          : <div style={{ padding: '24px 32px', display: 'grid', gridTemplateColumns: '260px 1fr', gap: 32 }}>
              <div className="skel" style={{ height: 347 }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="skel" style={{ width: 240, height: 28 }} />
                <div className="skel" style={{ width: 160, height: 12 }} />
                <div className="skel" style={{ height: 80 }} />
                <div className="skel" style={{ height: 120 }} />
              </div>
            </div>
        }
      </>
    );
  }

  const g = ug;
  const totalMin = Object.values(g.playtimeByPlatform).reduce<number>((s, m) => s + (m ?? 0), 0);
  const statusColor = STATUS_COLOR[g.status] ?? 'var(--paper-faint)';
  const receipt = generateReceipt(g.id, g.addedAt);

  const hltbMain = g.hltb?.mainStory ? Math.round(g.hltb.mainStory / 60) : null;
  const hltbExtras = g.hltb?.mainExtras ? Math.round(g.hltb.mainExtras / 60) : null;
  const hltbComp = g.hltb?.completionist ? Math.round(g.hltb.completionist / 60) : null;
  const pctOfMain = hltbMain && totalMin > 0
    ? `${Math.round((totalMin / (hltbMain * 60)) * 100)}%`
    : '—';
  const stillOwedMin = g.hltb?.mainStory ? Math.max(0, g.hltb.mainStory - totalMin) : null;
  const stillOwed = stillOwedMin != null ? minutesToHours(stillOwedMin) : '—';

  const platforms = Object.entries(g.playtimeByPlatform)
    .filter(([, min]) => min !== undefined)
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0));

  const noteLines = g.notes ? g.notes.split('\n').filter(Boolean) : [];

  const hltbCells = [
    { label: 'MAIN STORY',     value: hltbMain ? `${hltbMain}h` : '—',    sub: 'community avg', you: false },
    { label: 'MAIN + EXTRAS',  value: hltbExtras ? `${hltbExtras}h` : '—', sub: 'community avg', you: false },
    { label: 'COMPLETIONIST',  value: hltbComp ? `${hltbComp}h` : '—',    sub: 'community avg', you: false },
    { label: 'YOUR PLAYTIME',  value: minutesToHours(totalMin),            sub: `across ${Object.keys(g.playtimeByPlatform).join(' · ')}`, you: true },
  ];


  return (
    <>
      <TopBar crumbs={['hoard', 'library', g.game.title.toLowerCase()]} />

      {/* PR A — A9e: explicit back affordance for desktop. Mobile already
          has navigate(-1) via MobileHeader's back caret; the breadcrumb's
          "library" link covers the slow-path but a chip is more discoverable. */}
      <div style={{ padding: '12px 36px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Btn sm onClick={() => navigate(-1)}>
          <Icon name="back" size={10} /> back
        </Btn>
        {/* Sync-quality batch (2026-05-08, decision #33): when the matcher
            grabbed the wrong game, this opens a search dialog. Notes /
            status / playtime are preserved across the remap. */}
        <Btn sm onClick={() => setRemapOpen(true)} ariaLabel="This is the wrong game — open the remap dialog">
          wrong game?
        </Btn>
      </div>

      {remapOpen && (
        <RemapGameModal
          userGameId={g.id}
          currentTitle={g.game.title}
          currentIgdbId={g.game.igdbId}
          onClose={() => setRemapOpen(false)}
          onRemapped={() => { setRemapOpen(false); refetch(); }}
        />
      )}

      <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', display: 'grid', gridTemplateColumns: '1fr 480px' }}>

          {/* LEFT */}
          <div style={{ padding: '32px 36px 40px' }}>
            <Marker>// game record · {g.lastPlayedAt ? `last sync ${formatRelative(g.lastPlayedAt)}` : 'never played'}</Marker>

            <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 28, marginTop: 18 }}>
              <Cover w={220} h={300} src={g.game.coverUrl} label={g.game.title.toUpperCase()} dev={g.game.developer ?? ''} year={shortYear(g.game.releaseYear)} bright />
              <div>
                <div className="t-up t-faint" style={{ fontSize: "var(--text-3xs)" }}>
                  {g.game.developer} · {g.game.releaseYear} · {g.game.genres[0] ?? '—'}
                </div>
                <div style={{ fontSize: "var(--text-2xl)", lineHeight: 1, color: 'var(--paper)', marginTop: 8, letterSpacing: '-0.015em' }}>{g.game.title}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div ref={statusRef} style={{ position: 'relative' }}>
                    <Chip on onClick={() => setStatusOpen(o => !o)} style={{ cursor: 'pointer' }}>
                      <span style={{ display: 'inline-block', width: 8, height: 8, background: statusColor, marginRight: 4 }} />
                      {g.status.toLowerCase()}
                      <Icon name="caret" size={9} style={{ marginLeft: 4 }} />
                    </Chip>
                    {statusOpen && (
                      <ul role="menu" aria-label="Change status" style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: 'var(--ink-2)', border: '1px solid var(--rule-bright)', zIndex: 100, minWidth: 140, padding: '4px 0', listStyle: 'none' }}>
                        {ALL_STATUSES.map(s => (
                          <li key={s} role="presentation">
                            <button
                              type="button"
                              role="menuitemradio"
                              aria-checked={s === g.status}
                              onClick={() => void changeStatus(s)}
                              style={{
                                padding: '6px 14px',
                                fontSize: "var(--text-2xs)",
                                fontFamily: 'var(--mono)',
                                color: s === g.status ? 'var(--paper)' : 'var(--paper-dim)',
                                background: s === g.status ? 'var(--ink-3)' : 'transparent',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                border: 'none',
                                width: '100%',
                                textAlign: 'left',
                              }}
                            >
                              <span style={{ display: 'inline-block', width: 7, height: 7, background: STATUS_COLOR[s] ?? 'var(--paper-dim)', flexShrink: 0 }} aria-hidden="true" />
                              {s}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <span style={{ flex: 1 }} />
                  {g.status !== 'Playing' && (
                    <Btn variant="primary" onClick={() => void changeStatus('Playing')}>
                      <Icon name="play" size={11} fill={true} /> start playing
                    </Btn>
                  )}
                  {g.status !== 'Completed' && (
                    <Btn onClick={() => void changeStatus('Completed')}>
                      <Icon name="check" size={11} /> mark complete
                    </Btn>
                  )}
                  <Btn variant="amber" onClick={() => { setNoteDraft(g.notes ?? ''); setEditingNotes(true); }}>+ note</Btn>
                </div>

                {/* quick stats */}
                <div style={{ marginTop: 22, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'var(--rule)', border: '1px solid var(--rule)' }}>
                  {([
                    [minutesToHours(totalMin), 'h logged'],
                    [hltbMain ? `~${hltbMain}` : '—', 'h main'],
                    [pctOfMain, 'complete'],
                    [g.lastPlayedAt ? formatRelative(g.lastPlayedAt) : '—', 'last touched'],
                  ] as [string, string][]).map(([v, k], i) => (
                    <div key={i} style={{ background: 'var(--ink)', padding: '14px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 6, minWidth: 0 }}>
                      <div className="t-mono t-tnum" style={{ fontSize: 24, lineHeight: 1, color: 'var(--paper)' }}>{v}</div>
                      <div className="t-up t-faint" style={{ fontSize: "var(--text-2xs)", lineHeight: 'var(--lh-snug)' }}>{k}</div>
                    </div>
                  ))}
                </div>

                {/* owned on */}
                <div style={{ marginTop: 24 }}>
                  <Marker>// owned on</Marker>
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {platforms.map(([code, min]) => (
                      <div key={code} style={{ display: 'grid', gridTemplateColumns: '32px 140px 1fr auto', gap: 14, alignItems: 'center', padding: '8px 14px', border: '1px solid var(--rule)', background: 'var(--ink)' }}>
                        <Plat code={code} lg />
                        <span style={{ fontSize: "var(--text-sm)" }}>{code}</span>
                        <span className="t-faint" style={{ fontSize: "var(--text-2xs)" }}>{formatRelative(g.lastPlayedAt)}</span>
                        <span className="t-tnum" style={{ fontSize: "var(--text-base)" }}>{minutesToHours(min ?? 0)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* HLTB */}
                {g.hltb && (
                  <div style={{ marginTop: 24 }}>
                    <Marker>// how long to beat · hltb</Marker>
                    <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'var(--rule)', border: '1px solid var(--rule)' }}>
                      {hltbCells.map((c, i) => (
                        <div key={i} style={{
                          background: 'var(--ink)',
                          padding: '14px 14px 12px',
                          borderTop: c.you ? '2px solid var(--amber)' : '2px solid transparent',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          gap: 6,
                          minWidth: 0,
                        }}>
                          <div className="t-up t-faint" style={{ fontSize: "var(--text-2xs)", letterSpacing: '0.12em', lineHeight: 'var(--lh-snug)' }}>{c.label}</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div className="t-mono t-tnum" style={{ fontSize: 26, color: c.you ? 'var(--amber)' : 'var(--paper)', lineHeight: 1 }}>{c.value}</div>
                            <div className="t-faint" style={{ fontSize: "var(--text-2xs)", lineHeight: 'var(--lh-snug)' }}>{c.sub}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '8px 10px 8px 14px', border: '1px solid var(--rule)', borderTop: 'none', background: 'var(--ink-2)' }}>
                      <a
                        className="t-mono"
                        href={
                          g.game.hltbId
                            ? `https://howlongtobeat.com/game/${g.game.hltbId}`
                            : `https://howlongtobeat.com/?q=${encodeURIComponent(g.game.title)}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          fontSize: "var(--text-2xs)", letterSpacing: '0.04em',
                          color: 'var(--paper-dim)',
                          padding: '4px 8px', border: '1px solid var(--rule)', background: 'var(--ink)',
                          textDecoration: 'none',
                        }}
                      >
                        <span>howlongtobeat.com</span>
                        <Icon name="ext" size={11} />
                      </a>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, fontSize: "var(--text-3xs)", color: 'var(--paper-dim)' }}>
                        <span><span className="t-mono t-tnum t-amber" style={{ fontSize: "var(--text-base)" }}>{pctOfMain}</span>&nbsp;of main</span>
                        <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--rule)' }} />
                        <span><span className="t-mono t-tnum" style={{ fontSize: "var(--text-base)", color: 'var(--paper)' }}>{stillOwed}</span>&nbsp;still owed</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* synopsis / genres */}
                <div style={{ marginTop: 24 }}>
                  <Marker>// the synopsis</Marker>
                  <div className="t-sans" style={{ marginTop: 10, fontSize: "var(--text-base)", lineHeight: 1.65, color: 'var(--paper-dim)', maxWidth: 620 }}>
                    {g.game.genres.length > 0 ? g.game.genres.join(' · ') : '—'}
                  </div>
                </div>

                {/* notes */}
                <div style={{ marginTop: 22 }}>
                  <Marker>// notes · private</Marker>
                  {editingNotes ? (
                    <div style={{ marginTop: 10 }}>
                      <label htmlFor="game-notes" className="sr-only">Game notes</label>
                      <textarea
                        // eslint-disable-next-line jsx-a11y/no-autofocus
                        autoFocus
                        id="game-notes"
                        value={noteDraft}
                        onChange={e => setNoteDraft(e.target.value)}
                        style={{ width: '100%', minHeight: 100, background: 'var(--ink-2)', border: '1px solid var(--rule-bright)', color: 'var(--paper)', fontFamily: 'var(--mono)', fontSize: "var(--text-sm)", lineHeight: 1.6, padding: '10px 14px', resize: 'vertical', boxSizing: 'border-box' }}
                        placeholder="// your notes here"
                      />
                      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                        <Btn sm variant="primary" onClick={() => void saveNote()}>save</Btn>
                        <Btn sm onClick={() => setEditingNotes(false)}>cancel</Btn>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setNoteDraft(g.notes ?? ''); setEditingNotes(true); }}
                      style={{ marginTop: 10, padding: 16, border: '1px dashed var(--rule-bright)', background: 'var(--ink-2)', fontFamily: 'var(--mono)', fontSize: "var(--text-sm)", lineHeight: 1.6, color: 'var(--paper)', cursor: 'pointer', textAlign: 'left', width: '100%' }}
                    >
                      <div className="t-faint" style={{ fontSize: "var(--text-3xs)", marginBottom: 6 }}>{g.updatedAt.slice(0, 10)}</div>
                      {noteLines.length > 0
                        ? noteLines.map((note, i) => <div key={i}><span className="t-green">&gt;</span> {note}</div>)
                        : <div className="t-faint">no notes yet · click to add</div>
                      }
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: receipt */}
          <div style={{ padding: '32px 36px 40px 0', display: 'flex', justifyContent: 'center' }}>
            <div style={{ position: 'relative', width: 380 }}>
              <Marker style={{ position: 'absolute', top: -18, left: 0 }}>// shareable receipt · v0.7</Marker>
              <div className="receipt" style={{
                fontFamily: 'var(--mono)', fontSize: "var(--text-xs)", lineHeight: 1.65,
                boxShadow: '0 24px 60px -12px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
                transform: 'rotate(-0.4deg)',
              }}>
                <div className="center">
                  <div className="t-display" style={{ fontSize: 26, letterSpacing: '0.06em' }}>hoard</div>
                  <div style={{ fontSize: "var(--text-3xs)", marginTop: 2, letterSpacing: '0.18em' }}>=== GAME · RECORD ===</div>
                  <div style={{ fontSize: "var(--text-3xs)", marginTop: 6, letterSpacing: '0.08em' }}>{receipt.date}</div>
                  <div style={{ fontSize: "var(--text-3xs)", letterSpacing: '0.08em' }}>cashier: andrea · ref# {receipt.ref}</div>
                </div>

                <div className="rule" style={{ margin: '14px 0' }} />

                <div className="center">
                  <div style={{ fontSize: "var(--text-lg)", letterSpacing: '-0.01em', lineHeight: 1.1, fontWeight: 700 }}>{g.game.title.toUpperCase()}</div>
                  <div style={{ fontSize: "var(--text-2xs)", marginTop: 4 }}>{g.game.developer} · {g.game.releaseYear}</div>
                  <div style={{ fontSize: "var(--text-2xs)" }}>{g.game.genres[0] ?? '—'}</div>
                </div>

                <div className="rule" style={{ margin: '14px 0' }} />

                <div className="row"><span>STATUS</span><span className="dots" /><span>{g.status.toUpperCase()}</span></div>
                <div className="row"><span>RATING</span><span className="dots" /><span>{g.rating != null ? `${g.rating}/5` : '—/★★★★★'}</span></div>
                <div className="row"><span>FIRST ADDED</span><span className="dots" /><span>{g.addedAt.slice(0, 10)}</span></div>

                <div className="rule" style={{ margin: '14px 0' }} />

                <div className="section-head">OWNED ON</div>
                {platforms.map(([code, min]) => (
                  <div key={code} className="row">
                    <span>{code}</span>
                    <span className="dots" />
                    <span>{minutesToHours(min ?? 0)}</span>
                  </div>
                ))}
                <div style={{ borderTop: '1px solid', opacity: 0.25, margin: '6px 0 4px' }} />
                <div className="row" style={{ fontWeight: 700 }}>
                  <span>SUBTOTAL</span>
                  <span className="dots" />
                  <span>{minutesToHours(totalMin)}</span>
                </div>

                <div className="rule" style={{ margin: '14px 0' }} />

                <div className="section-head">PROGRESS</div>
                <div className="row">
                  <span>HLTB MAIN STORY</span>
                  <span className="dots" />
                  <span>{hltbMain ? `${hltbMain} h` : '—'}</span>
                </div>
                <div className="row">
                  <span>HLTB COMPLETIONIST</span>
                  <span className="dots" />
                  <span>{hltbComp ? `${hltbComp} h` : '—'}</span>
                </div>
                <div className="row">
                  <span>% OF MAIN</span>
                  <span className="dots" />
                  <span>{pctOfMain}</span>
                </div>
                <div className="row">
                  <span>LAST PLAYED</span>
                  <span className="dots" />
                  <span>{g.lastPlayedAt ? formatRelative(g.lastPlayedAt) : 'never'}</span>
                </div>

                <div className="rule" style={{ margin: '14px 0' }} />

                <div className="section-head">NOTES</div>
                <div style={{ fontSize: "var(--text-2xs)", lineHeight: 1.65 }}>
                  {noteLines.length > 0
                    ? noteLines.map((n, i) => <div key={i} style={{ display: 'flex', gap: 6 }}><span style={{ opacity: 0.5, flexShrink: 0 }}>&gt;</span><span>{n}</span></div>)
                    : <div style={{ opacity: 0.5 }}>&gt; no notes yet</div>
                  }
                </div>

                <div className="rule solid" style={{ margin: '14px 0 12px' }} />

                <div className="row" style={{ fontSize: "var(--text-sm)", fontWeight: 700 }}>
                  <span>TOTAL · YOUR HOARD</span><span>{minutesToHours(totalMin)}</span>
                </div>
                {g.hltb?.mainStory && (
                  <>
                    <div className="row" style={{ fontSize: "var(--text-2xs)" }}>
                      <span>· of estimated</span><span>{hltbMain} h</span>
                    </div>
                    <div className="row" style={{ fontSize: "var(--text-2xs)" }}>
                      <span>· still owed</span><span>{stillOwed}</span>
                    </div>
                  </>
                )}

                <div className="rule" style={{ margin: '14px 0' }} />

                <div className="center" style={{ fontSize: "var(--text-2xs)", marginBottom: 12 }}>
                  ** thank u for hoarding **<br />
                  <span style={{ fontSize: "var(--text-2xs)", opacity: 0.65 }}>nothing here is for sale</span>
                </div>

                <Barcode code={receipt.barcode} />

                <div className="center" style={{ fontSize: "var(--text-2xs)", marginTop: 10, letterSpacing: '0.16em', opacity: 0.7 }}>
                  hoard.app/g/{g.game.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}
                </div>
              </div>

              <div style={{ height: 24, margin: '0 30px', background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.5), transparent 70%)' }} />
            </div>
          </div>
        </div>
    </>
  );
}
