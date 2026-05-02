import { useParams } from 'react-router-dom';
import { Sidebar } from '../layout/Sidebar';
import { TopBar } from '../layout/TopBar';
import { Marker } from '../primitives/Marker';
import { Cover } from '../primitives/Cover';
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

export function GameDetailDesktop() {
  const { id } = useParams<{ id: string }>();
  const { data: ug, loading, error } = useGame(id);

  if (loading || !ug) {
    return (
      <div className="app-shell hoard-noise">
        <Sidebar />
        <div className="app-main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="t-mono t-faint" style={{ fontSize: 12 }}>
            {error ? `// error: ${error}` : '// loading...'}
          </span>
        </div>
      </div>
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

  const platLines = platforms
    .map(([code, min]) => `${code.padEnd(2)}  ${code.padEnd(12)}  ${minutesToHours(min ?? 0).padStart(6)}`)
    .join('\n');
  const subtotal = `${''.padEnd(16)}  ─────────\nSUBTOTAL  ${minutesToHours(totalMin).padStart(10)}`;

  return (
    <div className="app-shell hoard-noise">
      <Sidebar />
      <div className="app-main">
        <TopBar crumbs={['hoard', 'library', g.game.title.toLowerCase()]} />

        <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', display: 'grid', gridTemplateColumns: '1fr 480px' }}>

          {/* LEFT */}
          <div style={{ padding: '32px 36px 40px' }}>
            <Marker>// game record · {g.lastPlayedAt ? `last sync ${formatRelative(g.lastPlayedAt)}` : 'never played'}</Marker>

            <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 28, marginTop: 18 }}>
              <Cover w={220} h={300} src={g.game.coverUrl} label={g.game.title.toUpperCase()} dev={g.game.developer ?? ''} year={shortYear(g.game.releaseYear)} bright />
              <div>
                <div className="t-up t-faint" style={{ fontSize: 10 }}>
                  {g.game.developer} · {g.game.releaseYear} · {g.game.genres[0] ?? '—'}
                </div>
                <div style={{ fontSize: 44, lineHeight: 1, color: 'var(--paper)', marginTop: 8, letterSpacing: '-0.015em' }}>{g.game.title}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Chip on>
                    <span style={{ display: 'inline-block', width: 8, height: 8, background: statusColor, marginRight: 4 }} />
                    {g.status.toLowerCase()}
                  </Chip>
                  <span style={{ flex: 1 }} />
                  <Btn variant="primary"><Icon name="play" size={11} fill={true} /> start playing</Btn>
                  <Btn variant="amber">+ note</Btn>
                  <Btn><Icon name="arrowR" size={11} /> share receipt</Btn>
                </div>

                {/* quick stats */}
                <div style={{ marginTop: 22, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'var(--rule)', border: '1px solid var(--rule)' }}>
                  {([
                    [minutesToHours(totalMin), 'h logged'],
                    [hltbMain ? `~${hltbMain}` : '—', 'h main'],
                    [pctOfMain, 'complete'],
                    [g.lastPlayedAt ? formatRelative(g.lastPlayedAt) : '—', 'last touched'],
                  ] as [string, string][]).map(([v, k], i) => (
                    <div key={i} style={{ background: 'var(--ink)', padding: '14px 16px', display: 'grid', gridTemplateRows: '28px 12px', rowGap: 4, alignContent: 'start' }}>
                      <div className="t-mono t-tnum" style={{ fontSize: 24, lineHeight: 1, alignSelf: 'center', color: 'var(--paper)' }}>{v}</div>
                      <div className="t-up t-faint" style={{ fontSize: 9, alignSelf: 'end' }}>{k}</div>
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
                        <span style={{ fontSize: 13 }}>{code}</span>
                        <span className="t-faint" style={{ fontSize: 11 }}>{formatRelative(g.lastPlayedAt)}</span>
                        <span className="t-tnum" style={{ fontSize: 14 }}>{minutesToHours(min ?? 0)}</span>
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
                          display: 'grid',
                          gridTemplateRows: '24px 32px 14px',
                          rowGap: 4,
                          alignContent: 'start',
                        }}>
                          <div className="t-up t-faint" style={{ fontSize: 9, letterSpacing: '0.12em', lineHeight: 1.2, alignSelf: 'start' }}>{c.label}</div>
                          <div className="t-mono t-tnum" style={{ fontSize: 26, color: c.you ? 'var(--amber)' : 'var(--paper)', lineHeight: 1, alignSelf: 'center' }}>{c.value}</div>
                          <div className="t-faint" style={{ fontSize: 9, lineHeight: 1.2, alignSelf: 'end' }}>{c.sub}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '8px 10px 8px 14px', border: '1px solid var(--rule)', borderTop: 'none', background: 'var(--ink-2)' }}>
                      <span className="t-mono" style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        fontSize: 11, letterSpacing: '0.04em',
                        color: 'var(--paper-dim)',
                        padding: '4px 8px', border: '1px solid var(--rule)', background: 'var(--ink)',
                      }}>
                        <span>howlongtobeat.com</span>
                        <Icon name="ext" size={11} />
                      </span>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, fontSize: 10, color: 'var(--paper-faint)' }}>
                        <span><span className="t-mono t-tnum t-amber" style={{ fontSize: 14 }}>{pctOfMain}</span>&nbsp;of main</span>
                        <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--rule)' }} />
                        <span><span className="t-mono t-tnum" style={{ fontSize: 14, color: 'var(--paper)' }}>{stillOwed}</span>&nbsp;still owed</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* synopsis / genres */}
                <div style={{ marginTop: 24 }}>
                  <Marker>// the synopsis</Marker>
                  <div className="t-sans" style={{ marginTop: 10, fontSize: 14, lineHeight: 1.65, color: 'var(--paper-dim)', maxWidth: 620 }}>
                    {g.game.genres.length > 0 ? g.game.genres.join(' · ') : '—'}
                  </div>
                </div>

                {/* notes */}
                <div style={{ marginTop: 22 }}>
                  <Marker>// notes · private</Marker>
                  <div style={{ marginTop: 10, padding: 16, border: '1px dashed var(--rule-bright)', background: 'var(--ink-2)', fontFamily: 'var(--mono)', fontSize: 13, lineHeight: 1.6, color: 'var(--paper)' }}>
                    <div className="t-faint" style={{ fontSize: 10, marginBottom: 6 }}>{g.updatedAt.slice(0, 10)}</div>
                    {noteLines.length > 0
                      ? noteLines.map((note, i) => <div key={i}><span className="t-green">&gt;</span> {note}</div>)
                      : <div className="t-faint">no notes yet</div>
                    }
                    <div className="t-faint" style={{ fontSize: 10, marginTop: 12 }}>— add note</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: receipt */}
          <div style={{ padding: '32px 36px 40px 0', display: 'flex', justifyContent: 'center' }}>
            <div style={{ position: 'relative', width: 380 }}>
              <Marker style={{ position: 'absolute', top: -18, left: 0 }}>// shareable receipt · v0.7</Marker>
              <div className="receipt" style={{
                fontFamily: 'var(--mono)', fontSize: 12, lineHeight: 1.65,
                boxShadow: '0 24px 60px -12px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
                transform: 'rotate(-0.4deg)',
              }}>
                <div className="center">
                  <div className="t-display" style={{ fontSize: 26, letterSpacing: '0.06em' }}>hoard</div>
                  <div style={{ fontSize: 10, marginTop: 2, letterSpacing: '0.18em' }}>=== GAME · RECORD ===</div>
                  <div style={{ fontSize: 10, marginTop: 6, letterSpacing: '0.08em' }}>{receipt.date}</div>
                  <div style={{ fontSize: 10, letterSpacing: '0.08em' }}>cashier: andrea · ref# {receipt.ref}</div>
                </div>

                <div className="rule" style={{ margin: '14px 0' }} />

                <div className="center">
                  <div style={{ fontSize: 22, letterSpacing: '-0.01em', lineHeight: 1.1, fontWeight: 700 }}>{g.game.title.toUpperCase()}</div>
                  <div style={{ fontSize: 11, marginTop: 4 }}>{g.game.developer} · {g.game.releaseYear}</div>
                  <div style={{ fontSize: 11 }}>{g.game.genres[0] ?? '—'}</div>
                </div>

                <div className="rule" style={{ margin: '14px 0' }} />

                <div className="row"><span>STATUS</span><span style={{ flex: 1, borderBottom: '1px dotted', alignSelf: 'end', margin: '0 6px 5px', height: 0 }} /><span>{g.status.toUpperCase()}</span></div>
                <div className="row"><span>RATING</span><span style={{ flex: 1, borderBottom: '1px dotted', alignSelf: 'end', margin: '0 6px 5px', height: 0 }} /><span>{g.rating != null ? `${g.rating}/5` : '—/★★★★★'}</span></div>
                <div className="row"><span>FIRST ADDED</span><span style={{ flex: 1, borderBottom: '1px dotted', alignSelf: 'end', margin: '0 6px 5px', height: 0 }} /><span>{g.addedAt.slice(0, 10)}</span></div>

                <div className="rule" style={{ margin: '14px 0' }} />

                <div style={{ fontSize: 10, letterSpacing: '0.1em', marginBottom: 6 }}>OWNED ON ────────────────────</div>
                <pre style={{ fontSize: 11, lineHeight: 1.55, margin: 0, fontFamily: 'inherit' }}>
                  {platLines}{'\n'}{subtotal}
                </pre>

                <div className="rule" style={{ margin: '14px 0' }} />

                <div style={{ fontSize: 10, letterSpacing: '0.1em', marginBottom: 6 }}>PROGRESS ─────────────────────</div>
                <pre style={{ fontSize: 11, lineHeight: 1.55, margin: 0, fontFamily: 'inherit' }}>
{`HLTB main story ...... ${hltbMain ? `${hltbMain} h` : '—'}
HLTB completionist ... ${hltbComp ? `${hltbComp} h` : '—'}
% of main ............ ${pctOfMain}
last played ...... ${g.lastPlayedAt ? formatRelative(g.lastPlayedAt) : 'never'}`}
                </pre>

                <div className="rule" style={{ margin: '14px 0' }} />

                <div style={{ fontSize: 10, letterSpacing: '0.1em', marginBottom: 6 }}>NOTES ────────────────────────</div>
                <div style={{ fontSize: 11, lineHeight: 1.5 }}>
                  {noteLines.length > 0
                    ? noteLines.map((n, i) => <div key={i}>&gt; {n}</div>)
                    : <div>&gt; no notes yet</div>
                  }
                </div>

                <div className="rule solid" style={{ margin: '14px 0 12px' }} />

                <div className="row" style={{ fontSize: 13, fontWeight: 700 }}>
                  <span>TOTAL · YOUR HOARD</span><span>{minutesToHours(totalMin)}</span>
                </div>
                {g.hltb?.mainStory && (
                  <>
                    <div className="row" style={{ fontSize: 11 }}>
                      <span>· of estimated</span><span>{hltbMain} h</span>
                    </div>
                    <div className="row" style={{ fontSize: 11 }}>
                      <span>· still owed</span><span>{stillOwed}</span>
                    </div>
                  </>
                )}

                <div className="rule" style={{ margin: '14px 0' }} />

                <div className="center" style={{ fontSize: 11, marginBottom: 12 }}>
                  ** thank u for hoarding **<br />
                  <span style={{ fontSize: 9, opacity: 0.65 }}>nothing here is for sale</span>
                </div>

                <Barcode code={receipt.barcode} />

                <div className="center" style={{ fontSize: 9, marginTop: 10, letterSpacing: '0.16em', opacity: 0.7 }}>
                  hoard.app/g/{g.game.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}
                </div>
              </div>

              <div style={{ height: 24, margin: '0 30px', background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.5), transparent 70%)' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
