import { useParams, useNavigate } from 'react-router-dom';
import { MobileFrame } from '../layout/MobileFrame';
import { Marker } from '../primitives/Marker';
import { Plat } from '../primitives/Plat';
import { Chip } from '../primitives/Chip';
import { Btn } from '../primitives/Btn';
import { Icon } from '../primitives/Icon';
import { Barcode } from '../primitives/Barcode';
import { useGame } from '../../hooks/useGame';
import { minutesToHours, formatRelative, shortYear, generateReceipt } from '../../lib/utils';

const STATUS_COLOR: Record<string, string> = {
  Playing: 'var(--green)',
  Backlog: 'var(--paper-faint)',
  Completed: 'var(--paper)',
  'On Hold': 'var(--blue)',
  Dropped: 'var(--red)',
  Wishlist: 'var(--amber)',
};

export function GameDetailMobile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: ug, loading, error } = useGame(id);

  if (loading || !ug) {
    return (
      <MobileFrame>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="t-mono t-faint" style={{ fontSize: 12 }}>
            {error ? `// error: ${error}` : '// loading...'}
          </span>
        </div>
      </MobileFrame>
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
    <MobileFrame>
      {/* back-bar header */}
      <div style={{ padding: '8px 16px 10px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--ink)' }}>
        <span
          style={{ color: 'var(--paper-dim)', fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
          onClick={() => navigate('/library')}
        >
          <Icon name="back" size={14} /> library
        </span>
        <span className="t-up t-faint" style={{ fontSize: 9 }}>// game record</span>
        <span style={{ color: 'var(--paper-dim)', fontSize: 13 }}><Icon name="arrowR" size={13} /></span>
      </div>

      <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '16px 18px 24px', background: 'var(--void)' }}>
        {/* status */}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 14 }}>
          <Chip on>
            <span style={{ display: 'inline-block', width: 8, height: 8, background: statusColor, marginRight: 4 }} />
            {g.status.toLowerCase()}
          </Chip>
          <Chip>change <Icon name="caret" size={10} /></Chip>
        </div>

        {/* receipt */}
        <div className="receipt" style={{
          fontFamily: 'var(--mono)', fontSize: 11, lineHeight: 1.6, padding: '20px 22px',
          boxShadow: '0 16px 40px -8px rgba(0,0,0,0.7)',
          transform: 'rotate(-0.3deg)',
        }}>
          <div className="center">
            <div className="t-display" style={{ fontSize: 22, letterSpacing: '0.06em' }}>hoard</div>
            <div style={{ fontSize: 9, marginTop: 2, letterSpacing: '0.18em' }}>=== GAME · RECORD ===</div>
            <div style={{ fontSize: 9, marginTop: 4, letterSpacing: '0.08em' }}>{receipt.date} · ref# {receipt.ref}</div>
          </div>

          <div className="rule" style={{ margin: '12px 0' }} />

          <div className="center">
            <div style={{ fontSize: 18, lineHeight: 1.05, fontWeight: 700, letterSpacing: '-0.01em' }}>{g.game.title.toUpperCase()}</div>
            <div style={{ fontSize: 10, marginTop: 4 }}>{g.game.developer} · {g.game.releaseYear}</div>
            <div style={{ fontSize: 10 }}>{g.game.genres[0] ?? '—'}</div>
          </div>

          <div className="rule" style={{ margin: '12px 0' }} />

          <pre style={{ fontSize: 10.5, lineHeight: 1.6, margin: 0, fontFamily: 'inherit' }}>
{`STATUS .......... ${g.status.toUpperCase()}
RATING .......... ${g.rating != null ? `${g.rating}/5` : '—/★★★★★'}
ADDED ........... ${g.addedAt.slice(0, 10)}`}
          </pre>

          <div className="rule" style={{ margin: '12px 0' }} />

          <div style={{ fontSize: 9, letterSpacing: '0.1em', marginBottom: 6 }}>OWNED ON ──────────────</div>
          <pre style={{ fontSize: 10.5, lineHeight: 1.55, margin: 0, fontFamily: 'inherit' }}>
            {platLines}
            {'\n              ───────\nSUBTOTAL '}
            {minutesToHours(totalMin).padStart(9)}
          </pre>

          <div className="rule" style={{ margin: '12px 0' }} />

          <div style={{ fontSize: 9, letterSpacing: '0.1em', marginBottom: 6 }}>PROGRESS ─────────────</div>
          <pre style={{ fontSize: 10.5, lineHeight: 1.55, margin: 0, fontFamily: 'inherit' }}>
{`HLTB main ........ ${hltbMain ? `${hltbMain} h` : '—'}
% of main ........ ${pctOfMain}
last played .. ${g.lastPlayedAt ? formatRelative(g.lastPlayedAt) : 'never'}`}
          </pre>

          <div className="rule" style={{ margin: '12px 0' }} />

          <div style={{ fontSize: 9, letterSpacing: '0.1em', marginBottom: 4 }}>NOTES ────────────────</div>
          <div style={{ fontSize: 10.5, lineHeight: 1.5 }}>
            {noteLines.length > 0
              ? noteLines.map((n, i) => <div key={i}>&gt; {n}</div>)
              : <div>&gt; no notes yet</div>
            }
          </div>

          <div className="rule solid" style={{ margin: '12px 0 10px' }} />

          <div className="row" style={{ fontSize: 12, fontWeight: 700 }}>
            <span>TOTAL · HOARD</span><span>{minutesToHours(totalMin)}</span>
          </div>
          {g.hltb?.mainStory && (
            <div className="row" style={{ fontSize: 10 }}>
              <span>· still owed</span><span>{stillOwed}</span>
            </div>
          )}

          <div className="rule" style={{ margin: '10px 0' }} />

          <div className="center" style={{ fontSize: 10 }}>
            ** thank u for hoarding **
          </div>
          <div style={{ marginTop: 10 }}>
            <Barcode code={receipt.barcode} height={28} />
          </div>
          <div className="center" style={{ fontSize: 8, marginTop: 8, letterSpacing: '0.16em', opacity: 0.7 }}>
            hoard.app/g/{g.game.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}
          </div>
        </div>

        {/* action buttons */}
        <div style={{ marginTop: 18, display: 'flex', gap: 8, justifyContent: 'center' }}>
          <Btn variant="primary" sm><Icon name="play" size={10} fill={true} /> start</Btn>
          <Btn sm>+ note</Btn>
          <Btn sm><Icon name="arrowR" size={10} /> share</Btn>
        </div>

        {/* owned on */}
        <div style={{ marginTop: 20 }}>
          <Marker>// owned on</Marker>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {platforms.map(([code, min]) => (
              <div key={code} style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: 10, alignItems: 'center', padding: '8px 12px', border: '1px solid var(--rule)', background: 'var(--ink)' }}>
                <Plat code={code} />
                <span style={{ fontSize: 12 }}>{code} <span className="t-faint" style={{ fontSize: 10 }}>· {g.lastPlayedAt ? formatRelative(g.lastPlayedAt) : 'never'}</span></span>
                <span className="t-tnum" style={{ fontSize: 13 }}>{minutesToHours(min ?? 0)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </MobileFrame>
  );
}
