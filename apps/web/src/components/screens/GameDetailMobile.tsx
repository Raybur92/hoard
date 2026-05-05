import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { Marker } from '../primitives/Marker';
import { Plat } from '../primitives/Plat';
import { Chip } from '../primitives/Chip';
import { Btn } from '../primitives/Btn';
import { Icon } from '../primitives/Icon';
import { Barcode } from '../primitives/Barcode';
import { useGame } from '../../hooks/useGame';
import { minutesToHours, formatRelative, generateReceipt } from '../../lib/utils';
import type { GameStatus } from '@hoard/types';

const STATUS_COLOR: Record<string, string> = {
  Playing: 'var(--green)',
  Backlog: 'var(--paper-faint)',
  Completed: 'var(--paper)',
  'On Hold': 'var(--blue)',
  Dropped: 'var(--red)',
  Wishlist: 'var(--amber)',
};

const ALL_STATUSES: GameStatus[] = ['Playing', 'Backlog', 'Completed', 'On Hold', 'Dropped', 'Wishlist'];

export function GameDetailMobile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: ug, loading, error, update } = useGame(id);
  useDocumentTitle(ug?.game.title ?? 'Game');

  const [statusSheetOpen, setStatusSheetOpen] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const sheetTrapRef = useFocusTrap<HTMLDivElement>(statusSheetOpen);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Escape closes the status sheet
  useEffect(() => {
    if (!statusSheetOpen) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setStatusSheetOpen(false); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [statusSheetOpen]);

  useEffect(() => () => {
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
  }, []);

  async function changeStatus(s: GameStatus) {
    setStatusSheetOpen(false);
    try { await update({ status: s }); }
    catch { /* error surfaces via the data layer; no toast here */ }
  }

  async function saveNote() {
    setEditingNotes(false);
    try {
      await update({ notes: noteDraft });
      setSavedFlash(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSavedFlash(false), 2000);
    } catch { /* silent */ }
  }

  function startEditingNotes() {
    setNoteDraft(ug?.notes ?? '');
    setEditingNotes(true);
    // Focus the textarea on next tick
    setTimeout(() => notesRef.current?.focus(), 0);
  }

  async function handleStartPressed() {
    if (!ug || ug.status === 'Playing') return;
    try { await update({ status: 'Playing' }); }
    catch { /* silent */ }
  }

  async function handleSharePressed() {
    if (!ug) return;
    const url = `${window.location.origin}/g/${ug.game.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    if (navigator.share) {
      try { await navigator.share({ title: ug.game.title, url }); }
      catch { /* user cancelled */ }
    } else if (navigator.clipboard) {
      try { await navigator.clipboard.writeText(url); }
      catch { /* clipboard blocked */ }
    }
  }

  if (loading || !ug) {
    return (
      <div style={{ flex: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' }}>
        {error
          ? <span className="t-mono t-red" style={{ fontSize: "var(--text-xs)" }}>{`// error: ${error}`}</span>
          : <>
              <div className="skel" style={{ height: 180 }} />
              <div className="skel" style={{ width: 200, height: 20 }} />
              <div className="skel" style={{ width: 120, height: 11 }} />
              <div className="skel" style={{ height: 80 }} />
              <div className="skel" style={{ height: 100 }} />
            </>
        }
      </div>
    );
  }

  const g = ug;
  const totalMin = Object.values(g.playtimeByPlatform).reduce<number>((s, m) => s + (m ?? 0), 0);
  const statusColor = STATUS_COLOR[g.status] ?? 'var(--paper-faint)';
  const receipt = generateReceipt(g.id, g.addedAt);

  const hltbMain = g.hltb?.mainStory ? Math.round(g.hltb.mainStory / 60) : null;
  const pctOfMain = hltbMain && totalMin > 0
    ? `${Math.round((totalMin / (hltbMain * 60)) * 100)}%`
    : '—';
  const stillOwedMin = g.hltb?.mainStory ? Math.max(0, g.hltb.mainStory - totalMin) : null;
  const stillOwed = stillOwedMin != null ? minutesToHours(stillOwedMin) : '—';

  const platforms = Object.entries(g.playtimeByPlatform)
    .filter(([, min]) => min !== undefined)
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0));

  const noteLines = g.notes ? g.notes.split('\n').filter(Boolean) : [];

  const platLines = platforms
    .map(([code, min]) => `${code.padEnd(2)}  ${code.padEnd(8)}  ${minutesToHours(min ?? 0).padStart(5)}`)
    .join('\n');

  return (
    <>
      {/* back-bar header */}
      <div style={{ padding: '8px 16px 10px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--ink)' }}>
        <button
          type="button"
          aria-label="Back"
          onClick={() => navigate(-1)}
          style={{ color: 'var(--paper-dim)', fontSize: "var(--text-base)", display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', background: 'transparent', border: 'none', padding: 8, margin: -8, fontFamily: 'inherit' }}
        >
          <Icon name="back" size={14} /> back
        </button>
        <span className="t-up t-faint" style={{ fontSize: "var(--text-2xs)" }}>// game record</span>
        <span style={{ width: 14 }} aria-hidden="true" />
      </div>

      <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '16px 18px 24px', background: 'var(--void)' }}>
        {/* status */}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 14, alignItems: 'center' }}>
          <Chip on>
            <span style={{ display: 'inline-block', width: 8, height: 8, background: statusColor, marginRight: 4 }} aria-hidden="true" />
            {g.status.toLowerCase()}
          </Chip>
          <Chip onClick={() => setStatusSheetOpen(true)} pressed={false} ariaLabel="Change game status">
            change <Icon name="caret" size={10} />
          </Chip>
          {savedFlash && (
            <span role="status" aria-live="polite" className="t-mono t-green" style={{ fontSize: "var(--text-3xs)", marginLeft: 4 }}>// saved</span>
          )}
        </div>

        {/* receipt */}
        <div className="receipt" style={{
          fontFamily: 'var(--mono)', fontSize: "var(--text-2xs)", lineHeight: 1.6, padding: '20px 22px',
          boxShadow: '0 16px 40px -8px rgba(0,0,0,0.7)',
          transform: 'rotate(-0.3deg)',
        }}>
          <div className="center">
            <div className="t-display" style={{ fontSize: "var(--text-lg)", letterSpacing: '0.06em' }}>hoard</div>
            <div style={{ fontSize: "var(--text-2xs)", marginTop: 2, letterSpacing: '0.18em' }}>=== GAME · RECORD ===</div>
            <div style={{ fontSize: "var(--text-2xs)", marginTop: 4, letterSpacing: '0.08em' }}>{receipt.date} · ref# {receipt.ref}</div>
          </div>

          <div className="rule" style={{ margin: '12px 0' }} />

          <div className="center">
            <div style={{ fontSize: "var(--text-md)", lineHeight: 1.05, fontWeight: 700, letterSpacing: '-0.01em' }}>{g.game.title.toUpperCase()}</div>
            <div style={{ fontSize: "var(--text-3xs)", marginTop: 4 }}>{g.game.developer} · {g.game.releaseYear}</div>
            <div style={{ fontSize: "var(--text-3xs)" }}>{g.game.genres[0] ?? '—'}</div>
          </div>

          <div className="rule" style={{ margin: '12px 0' }} />

          <pre style={{ fontSize: "var(--text-3xs)", lineHeight: 1.6, margin: 0, fontFamily: 'inherit' }}>
{`STATUS .......... ${g.status.toUpperCase()}
RATING .......... ${g.rating != null ? `${g.rating}/5` : '—/★★★★★'}
ADDED ........... ${g.addedAt.slice(0, 10)}`}
          </pre>

          <div className="rule" style={{ margin: '12px 0' }} />

          <div style={{ fontSize: "var(--text-2xs)", letterSpacing: '0.1em', marginBottom: 6 }}>OWNED ON ──────────────</div>
          <pre style={{ fontSize: "var(--text-3xs)", lineHeight: 1.55, margin: 0, fontFamily: 'inherit' }}>
            {platLines}
            {'\n              ───────\nSUBTOTAL '}
            {minutesToHours(totalMin).padStart(9)}
          </pre>

          <div className="rule" style={{ margin: '12px 0' }} />

          <div style={{ fontSize: "var(--text-2xs)", letterSpacing: '0.1em', marginBottom: 6 }}>PROGRESS ─────────────</div>
          <pre style={{ fontSize: "var(--text-3xs)", lineHeight: 1.55, margin: 0, fontFamily: 'inherit' }}>
{`HLTB main ........ ${hltbMain ? `${hltbMain} h` : '—'}
% of main ........ ${pctOfMain}
last played .. ${g.lastPlayedAt ? formatRelative(g.lastPlayedAt) : 'never'}`}
          </pre>

          <div className="rule" style={{ margin: '12px 0' }} />

          {/* NOTES — tap to edit */}
          <div style={{ fontSize: "var(--text-2xs)", letterSpacing: '0.1em', marginBottom: 4 }}>NOTES ────────────────</div>
          {editingNotes ? (
            <div>
              <label htmlFor="game-notes-mobile" className="sr-only">Game notes</label>
              <textarea
                ref={notesRef}
                id="game-notes-mobile"
                value={noteDraft}
                onChange={e => setNoteDraft(e.target.value)}
                onBlur={() => void saveNote()}
                style={{
                  width: '100%', minHeight: 80,
                  background: 'transparent',
                  border: '1px dashed var(--receipt-ink)',
                  color: 'var(--receipt-ink)',
                  fontFamily: 'var(--mono)', fontSize: "var(--text-3xs)",
                  lineHeight: 1.5, padding: '6px 8px',
                  resize: 'vertical', boxSizing: 'border-box',
                }}
                placeholder="> your notes here"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={startEditingNotes}
              aria-label="Edit notes"
              style={{
                width: '100%', textAlign: 'left',
                background: 'transparent', border: 'none', padding: 0,
                color: 'inherit', fontFamily: 'inherit',
                fontSize: "var(--text-3xs)", lineHeight: 1.5,
                cursor: 'pointer',
              }}
            >
              {noteLines.length > 0
                ? noteLines.map((n, i) => <div key={i}>&gt; {n}</div>)
                : <div>&gt; tap to add notes</div>
              }
            </button>
          )}

          <div className="rule solid" style={{ margin: '12px 0 10px' }} />

          <div className="row" style={{ fontSize: "var(--text-xs)", fontWeight: 700 }}>
            <span>TOTAL · HOARD</span><span>{minutesToHours(totalMin)}</span>
          </div>
          {g.hltb?.mainStory && (
            <div className="row" style={{ fontSize: "var(--text-3xs)" }}>
              <span>· still owed</span><span>{stillOwed}</span>
            </div>
          )}

          <div className="rule" style={{ margin: '10px 0' }} />

          <div className="center" style={{ fontSize: "var(--text-3xs)" }}>
            ** thank u for hoarding **
          </div>
          <div style={{ marginTop: 10 }}>
            <Barcode code={receipt.barcode} height={28} />
          </div>
          <div className="center" style={{ fontSize: "var(--text-3xs)", marginTop: 8, letterSpacing: '0.16em', opacity: 0.7 }}>
            hoard.app/g/{g.game.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}
          </div>
        </div>

        {/* action buttons */}
        <div style={{ marginTop: 18, display: 'flex', gap: 8, justifyContent: 'center' }}>
          {g.status !== 'Playing' && (
            <Btn variant="primary" sm onClick={() => void handleStartPressed()}>
              <Icon name="play" size={10} fill={true} /> start
            </Btn>
          )}
          <Btn sm onClick={startEditingNotes}>+ note</Btn>
          <Btn sm onClick={() => void handleSharePressed()}>
            <Icon name="arrowR" size={10} /> share
          </Btn>
        </div>

        {/* owned on */}
        <div style={{ marginTop: 20 }}>
          <Marker>// owned on</Marker>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {platforms.map(([code, min]) => (
              <div key={code} style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: 10, alignItems: 'center', padding: '8px 12px', border: '1px solid var(--rule)', background: 'var(--ink)' }}>
                <Plat code={code} />
                <span style={{ fontSize: "var(--text-xs)" }}>{code} <span className="t-faint" style={{ fontSize: "var(--text-3xs)" }}>· {g.lastPlayedAt ? formatRelative(g.lastPlayedAt) : 'never'}</span></span>
                <span className="t-tnum" style={{ fontSize: "var(--text-sm)" }}>{minutesToHours(min ?? 0)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* status picker — bottom action sheet */}
      {statusSheetOpen && (
        <div
          ref={sheetTrapRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="status-sheet-title"
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
          }}
        >
          {/* backdrop (keyboard-accessible) */}
          <button
            type="button"
            aria-label="Close status picker"
            onClick={() => setStatusSheetOpen(false)}
            style={{ position: 'absolute', inset: 0, background: 'rgba(7,9,10,0.78)', border: 'none', cursor: 'default' }}
          />
          {/* sheet */}
          <div
            style={{
              position: 'relative',
              background: 'var(--ink)',
              borderTop: '1px solid var(--rule-bright)',
              paddingBottom: 'env(safe-area-inset-bottom)',
              boxShadow: '0 -16px 40px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ padding: '14px 18px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--rule)' }}>
              <h2 id="status-sheet-title" className="t-mono t-up" style={{ fontSize: "var(--text-2xs)", color: 'var(--paper-dim)', margin: 0, fontWeight: 'normal', letterSpacing: '0.12em' }}>// change status</h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setStatusSheetOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--paper-dim)', cursor: 'pointer', padding: 4, margin: -4 }}
              >
                <Icon name="x" size={12} />
              </button>
            </div>
            <ul role="menu" aria-label="Game status options" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {ALL_STATUSES.map(s => (
                <li key={s} role="presentation">
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={s === g.status}
                    onClick={() => void changeStatus(s)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      width: '100%', textAlign: 'left',
                      padding: '14px 18px',
                      background: s === g.status ? 'var(--ink-2)' : 'transparent',
                      color: s === g.status ? 'var(--paper)' : 'var(--paper-dim)',
                      border: 'none',
                      borderBottom: '1px solid var(--rule)',
                      fontFamily: 'var(--mono)',
                      fontSize: "var(--text-sm)",
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ display: 'inline-block', width: 10, height: 10, background: STATUS_COLOR[s] ?? 'var(--paper-dim)', flexShrink: 0 }} aria-hidden="true" />
                    <span style={{ flex: 1 }}>{s.toLowerCase()}</span>
                    {s === g.status && <Icon name="check" size={12} />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
