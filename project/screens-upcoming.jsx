/* Hoard — Upcoming releases (desktop + mobile) */

const UPCOMING = [
  { t: 'Pragmata', dev: 'Capcom', d: 'MAY 14, 2026', dow: 'THU', m: 'MAY', day: '14', away: 12, p: 'PS·ST·XB', tag: 'wishlisted', genre: 'Sci-fi · Puzzle-shooter', hype: 5 },
  { t: 'Crimson Desert', dev: 'Pearl Abyss', d: 'MAY 21, 2026', dow: 'THU', m: 'MAY', day: '21', away: 19, p: 'PS·ST·XB', tag: null, genre: 'Open-world ARPG', hype: 3 },
  { t: 'Mina the Hollower', dev: 'Yacht Club', d: 'JUN 02, 2026', dow: 'TUE', m: 'JUN', day: '02', away: 31, p: 'ST·PS·XB', tag: null, genre: 'Action-adventure', hype: 4 },
  { t: 'Death Stranding 2', dev: 'Kojima Productions', d: 'JUN 11, 2026', dow: 'THU', m: 'JUN', day: '11', away: 40, p: 'PS', tag: 'wishlisted', genre: 'Open-world action', hype: 5 },
  { t: 'Project Bloom', dev: 'Annapurna', d: 'JUL 09, 2026', dow: 'THU', m: 'JUL', day: '09', away: 68, p: 'ST·PS', tag: null, genre: 'Adventure', hype: 2 },
  { t: 'Hades II 1.0', dev: 'Supergiant', d: 'SEP 25, 2026', dow: 'FRI', m: 'SEP', day: '25', away: 146, p: 'ST', tag: 'wishlisted', genre: 'Roguelite', hype: 5 },
  { t: 'Silksong: Lost Verses', dev: 'Team Cherry', d: 'OCT 11, 2026', dow: 'SAT', m: 'OCT', day: '11', away: 162, p: 'ST·PS', tag: 'wishlisted', genre: 'Metroidvania DLC', hype: 4 },
  { t: 'Replaced', dev: 'Sad Cat Studios', d: 'TBA Q4 2026', dow: '—', m: 'TBA', day: '—', away: 210, p: 'XB·ST', tag: 'wishlisted', genre: 'Cyberpunk action', hype: 4 },
];

function HypeBars({ n }) {
  return (
    <div style={{ display: 'flex', gap: 1 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} style={{ width: 5, height: 8, background: i < n ? 'var(--amber)' : 'var(--ink-3)' }} />
      ))}
    </div>
  );
}

function UpcomingDesktop() {
  const featured = UPCOMING[0];
  return (
    <div className="hoard-screen hoard-noise" style={{ width: 1440, height: 900, display: 'flex' }}>
      <Sidebar active="Upcoming" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar crumbs={['hoard', 'upcoming']} />

        {/* month tabs */}
        <div style={{ padding: '16px 32px 0', borderBottom: '1px solid var(--rule)', display: 'flex', gap: 6, alignItems: 'baseline' }}>
          {['MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC','TBA'].map((m, i) => (
            <div key={m} style={{
              padding: '8px 14px',
              fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.1em',
              color: i === 0 ? 'var(--paper)' : 'var(--paper-faint)',
              borderBottom: i === 0 ? '2px solid var(--amber)' : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {m} <span className="t-faint" style={{ fontSize: 9 }}>{[4,3,1,2,2,3,1,2,5][i]}</span>
            </div>
          ))}
          <span style={{ flex: 1 }} />
          <div style={{ padding: '6px 0', display: 'flex', gap: 6, alignItems: 'center' }}>
            <Chip on><Icon name="star" size={11} /> wishlist · 5</Chip>
            <Chip>all releases</Chip>
            <span className="t-mono t-faint" style={{ fontSize: 11, marginLeft: 8 }}>plat: PS · ST · XB · GG</span>
          </div>
        </div>

        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 460px', minHeight: 0 }}>

          {/* left: featured + timeline */}
          <div className="thin-scroll" style={{ overflow: 'auto', padding: '24px 32px 32px', borderRight: '1px solid var(--rule)' }}>

            {/* featured */}
            <div className="panel" style={{ padding: 24, display: 'grid', gridTemplateColumns: '180px 1fr', gap: 24, alignItems: 'start' }}>
              <Cover w={180} h={240} label="PRAGMATA" dev="Capcom" year="’26" bright />
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                  <div style={{ minWidth: 0 }}>
                    <Marker>// next release · {featured.away} days away</Marker>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
                      <span className="t-display" style={{ fontSize: 48, lineHeight: 0.85, color: 'var(--amber)' }}>T-12</span>
                      <div>
                        <div style={{ fontSize: 26, lineHeight: 1.05, color: 'var(--paper)', letterSpacing: '-0.01em' }}>{featured.t}</div>
                        <div className="t-mono t-dim" style={{ fontSize: 12, marginTop: 4 }}>{featured.dev} · {featured.genre}</div>
                      </div>
                    </div>
                  </div>
                  {/* big countdown — top right */}
                  <div style={{ flex: '0 0 auto', display: 'flex', gap: 4 }}>
                    {[['12','D'],['07','H'],['44','M'],['18','S']].map(([v, k]) => (
                      <div key={k} style={{ background: 'var(--ink-2)', border: '1px solid var(--rule-bright)', padding: '6px 8px', textAlign: 'center', minWidth: 38 }}>
                        <div className="t-mono t-tnum" style={{ fontSize: 18, color: 'var(--amber)', lineHeight: 1 }}>{v}</div>
                        <div className="t-faint t-up" style={{ fontSize: 8, marginTop: 3 }}>{k}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, fontSize: 12 }}>
                  <div><div className="t-up t-faint" style={{ fontSize: 9 }}>release</div><div className="t-tnum" style={{ marginTop: 4, color: 'var(--paper)' }}>{featured.d}</div></div>
                  <div><div className="t-up t-faint" style={{ fontSize: 9 }}>day</div><div className="t-tnum" style={{ marginTop: 4 }}>thu · 09:00 utc</div></div>
                  <div><div className="t-up t-faint" style={{ fontSize: 9 }}>platforms</div><div style={{ marginTop: 4, display: 'flex', gap: 4 }}>{featured.p.split('·').map(x => <Plat key={x} p={x} lg />)}</div></div>
                  <div><div className="t-up t-faint" style={{ fontSize: 9 }}>hype</div><div style={{ marginTop: 6 }}><HypeBars n={featured.hype} /></div></div>
                </div>
                <div className="t-sans" style={{ marginTop: 16, fontSize: 13, lineHeight: 1.5, color: 'var(--paper-dim)' }}>
                  Capcom’s long-delayed sci-fi puzzle-shooter finally lands. A man, a girl, a sequence of equations on the moon — Pragmata pairs combat with real-time mathematical puzzles you solve mid-firefight.
                </div>
                <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Btn variant="amber" sm><Icon name="star" size={11} /> on wishlist</Btn>
                  <Btn sm><Icon name="play" size={11} fill={true} /> trailer</Btn>
                  <Btn sm><Icon name="bell" size={11} /> remind me</Btn>
                </div>
              </div>
            </div>

            {/* timeline */}
            <div style={{ marginTop: 28 }}>
              <Marker>// release timeline · may → oct 2026</Marker>
              <div style={{ marginTop: 16, position: 'relative', height: 110 }}>
                {/* event pins — absolute, alternating top/bottom to avoid overlap */}
                {[
                  { x: 4,  t: 'Pragmata',          d: 'MAY 14', star: true,  side: 'top' },
                  { x: 11, t: 'Crimson Desert',    d: 'MAY 21', star: false, side: 'bot' },
                  { x: 22, t: 'Mina',              d: 'JUN 02', star: false, side: 'top' },
                  { x: 33, t: 'Death Stranding 2', d: 'JUN 11', star: true,  side: 'bot' },
                  { x: 50, t: 'Project Bloom',     d: 'JUL 09', star: false, side: 'top' },
                  { x: 78, t: 'Hades II 1.0',      d: 'SEP 25', star: true,  side: 'bot' },
                  { x: 89, t: 'Silksong DLC',      d: 'OCT 11', star: true,  side: 'top' },
                ].map((e, i) => {
                  const labelTop = e.side === 'top';
                  return (
                    <div key={i} style={{
                      position: 'absolute', left: `${e.x}%`,
                      top: 0, height: '50%',
                      transform: 'translateX(-50%)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      width: 110,
                      ...(labelTop ? {} : { top: '50%' }),
                    }}>
                      {labelTop && (
                        <div style={{ textAlign: 'center', marginBottom: 4 }}>
                          <div style={{ fontSize: 10, color: e.star ? 'var(--amber)' : 'var(--paper)', whiteSpace: 'nowrap' }}>{e.star && <Icon name="star" size={9} fill={true} style={{ marginRight: 3 }} />}{e.t}</div>
                          <div className="t-mono t-faint" style={{ fontSize: 9, marginTop: 1 }}>{e.d}</div>
                        </div>
                      )}
                      <div style={{ flex: 1, width: 1, background: e.star ? 'var(--amber)' : 'var(--rule-bright)' }} />
                      {!labelTop && (
                        <div style={{ textAlign: 'center', marginTop: 4 }}>
                          <div style={{ fontSize: 10, color: e.star ? 'var(--amber)' : 'var(--paper)', whiteSpace: 'nowrap' }}>{e.star && <Icon name="star" size={9} fill={true} style={{ marginRight: 3 }} />}{e.t}</div>
                          <div className="t-mono t-faint" style={{ fontSize: 9, marginTop: 1 }}>{e.d}</div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {/* axis line in the middle */}
                <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'var(--rule-bright)' }}>
                  {[[0,'MAY'],[18,'JUN'],[36,'JUL'],[54,'AUG'],[72,'SEP'],[90,'OCT']].map(([x,l]) => (
                    <React.Fragment key={l}>
                      <div style={{ position: 'absolute', left: `${x}%`, top: -3, width: 1, height: 7, background: 'var(--rule-bright)' }} />
                      <div style={{ position: 'absolute', left: `${x}%`, top: 8, fontSize: 9, color: 'var(--paper-faint)', transform: 'translateX(-50%)', letterSpacing: '0.1em' }}>{l}</div>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>

            {/* this month list */}
            <div style={{ marginTop: 36 }}>
              <Marker>// may 2026 · 4 releases</Marker>
              <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
                {UPCOMING.slice(0, 4).map((g, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '60px 76px 1fr', gap: 14, padding: 14, border: '1px solid var(--rule)', background: 'var(--ink)' }}>
                    <div style={{ textAlign: 'center', borderRight: '1px dashed var(--rule-bright)', paddingRight: 8 }}>
                      <div className="t-up t-faint" style={{ fontSize: 9 }}>{g.m}</div>
                      <div className="t-display" style={{ fontSize: 26, color: g.tag ? 'var(--amber)' : 'var(--paper)', lineHeight: 1, marginTop: 3 }}>{g.day}</div>
                      <div className="t-mono t-faint" style={{ fontSize: 9, marginTop: 3 }}>{g.dow}</div>
                    </div>
                    <Cover w={76} h={100} label={g.t.split(' ')[0].toUpperCase()} bright={!!g.tag} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, color: 'var(--paper)', lineHeight: 1.15 }}>{g.t}</div>
                      <div className="t-mono t-faint" style={{ fontSize: 10, marginTop: 2 }}>{g.dev}</div>
                      <div className="t-faint" style={{ fontSize: 11, marginTop: 4 }}>{g.genre}</div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>{g.p.split('·').map(x => <Plat key={x} p={x} />)}</div>
                      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        {g.tag ? <span className="t-amber" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="star" size={10} fill={true} /> tracking</span> : <span className="t-faint" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="plus" size={10} /> wishlist</span>}
                        <HypeBars n={g.hype} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* right: full chronological list */}
          <div className="thin-scroll" style={{ overflow: 'auto' }}>
            <div style={{ padding: '18px 22px 6px', borderBottom: '1px solid var(--rule)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Marker>// agenda · all tracked</Marker>
              <span className="t-mono t-faint" style={{ fontSize: 10 }}>{UPCOMING.length} items</span>
            </div>
            {UPCOMING.map((g, i) => (
              <div key={i} style={{
                display: 'grid',
                gridTemplateColumns: '52px 32px 1fr auto',
                gap: 12,
                padding: '14px 22px',
                borderBottom: '1px dotted var(--rule)',
                alignItems: 'center',
                background: g.tag ? 'rgba(212,160,23,0.04)' : 'transparent',
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div className="t-up t-faint" style={{ fontSize: 8 }}>{g.m}</div>
                  <div className="t-display" style={{ fontSize: 20, color: g.tag ? 'var(--amber)' : 'var(--paper)', lineHeight: 1 }}>{g.day}</div>
                </div>
                <Cover w={32} h={42} label={g.t[0]} bright={!!g.tag} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, lineHeight: 1.1 }}>{g.t}</div>
                  <div className="t-faint" style={{ fontSize: 10, marginTop: 2 }}>{g.dev} · {g.p}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="t-tnum" style={{ fontSize: 13, color: g.tag ? 'var(--amber)' : 'var(--paper-dim)' }}>T-{g.away}d</div>
                  {g.tag && <div className="t-amber" style={{ marginTop: 2 }}><Icon name="star" size={10} fill={true} /></div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function UpcomingMobile() {
  return (
    <MobileFrame>
      <MobileHeader title="upcoming" sub="// 5 wishlisted · next in 12d" />

      {/* month strip */}
      <div className="thin-scroll" style={{ display: 'flex', gap: 4, padding: '10px 16px 0', overflowX: 'auto' }}>
        {['MAY 4','JUN 3','JUL 1','AUG 2','SEP 2','OCT 3','TBA 5'].map((m, i) => {
          const [name, n] = m.split(' ');
          return (
            <div key={m} style={{
              padding: '5px 10px',
              fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.08em',
              color: i === 0 ? 'var(--void)' : 'var(--paper-dim)',
              background: i === 0 ? 'var(--paper)' : 'transparent',
              border: '1px solid ' + (i === 0 ? 'var(--paper)' : 'var(--rule)'),
              whiteSpace: 'nowrap',
            }}>{name} · {n}</div>
          );
        })}
      </div>

      {/* featured countdown */}
      <div style={{ padding: '12px 16px 0' }}>
        <div className="panel" style={{ padding: 14, position: 'relative', borderColor: 'var(--amber-dim)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Marker style={{ color: 'var(--amber)' }}>// next drop</Marker>
            <span className="t-amber t-up" style={{ fontSize: 9, letterSpacing: '0.12em', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="star" size={10} fill={true} /> tracking</span>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
            <Cover w={64} h={86} label="PRAGMATA" dev="Capcom" bright />
            <div style={{ flex: 1 }}>
              <div className="t-display" style={{ fontSize: 32, color: 'var(--amber)', lineHeight: 0.9 }}>T-12</div>
              <div style={{ fontSize: 13, marginTop: 4, lineHeight: 1.15 }}>Pragmata</div>
              <div className="t-faint" style={{ fontSize: 10, marginTop: 2 }}>MAY 14 · Capcom · PS·ST·XB</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3, marginTop: 8 }}>
                {[['12','D'],['07','H'],['44','M'],['18','S']].map(([v, k]) => (
                  <div key={k} style={{ background: 'var(--ink-2)', border: '1px solid var(--rule)', padding: '4px 0', textAlign: 'center' }}>
                    <div className="t-tnum" style={{ fontSize: 13, color: 'var(--amber)', lineHeight: 1 }}>{v}</div>
                    <div className="t-faint" style={{ fontSize: 7, marginTop: 1 }}>{k}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* agenda list */}
      <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '14px 16px 0' }}>
        <Marker>// the agenda</Marker>
        <div style={{ marginTop: 10 }}>
          {UPCOMING.map((g, i) => (
            <div key={i} style={{
              display: 'grid',
              gridTemplateColumns: '40px 36px 1fr auto',
              gap: 10,
              padding: '10px 0',
              borderBottom: i < UPCOMING.length - 1 ? '1px dotted var(--rule-bright)' : 'none',
              alignItems: 'center',
            }}>
              <div style={{ textAlign: 'center' }}>
                <div className="t-up t-faint" style={{ fontSize: 8 }}>{g.m}</div>
                <div className="t-display" style={{ fontSize: 18, color: g.tag ? 'var(--amber)' : 'var(--paper)', lineHeight: 1 }}>{g.day}</div>
              </div>
              <Cover w={36} h={48} label={g.t[0]} bright={!!g.tag} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, lineHeight: 1.1 }}>{g.t}</div>
                <div className="t-faint" style={{ fontSize: 9, marginTop: 2 }}>{g.dev} · {g.p}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="t-tnum" style={{ fontSize: 12, color: g.tag ? 'var(--amber)' : 'var(--paper-dim)' }}>T-{g.away}d</div>
                {g.tag && <div className="t-amber"><Icon name="star" size={10} fill={true} /></div>}
              </div>
            </div>
          ))}
        </div>
      </div>
      <MobileTabBar active="Soon" />
    </MobileFrame>
  );
}

Object.assign(window, { UpcomingDesktop, UpcomingMobile });
