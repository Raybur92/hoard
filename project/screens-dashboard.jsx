/* Hoard — Dashboard (desktop + mobile) */

function DashDesktop() {
  return (
    <div className="hoard-screen hoard-noise" style={{ width: 1440, height: 900, display: 'flex' }}>
      <Sidebar active="Dashboard" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar crumbs={['hoard', 'dashboard']} />
        <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '24px 32px 32px' }}>

          {/* hero row: greeting + bignum + system status */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 28, alignItems: 'end' }}>
            <div>
              <Marker>// good evening, andrea · sat may 02 · 21:14</Marker>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 16 }}>
                <span className="bignum">428</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span className="t-up t-faint" style={{ fontSize: 11 }}>games owned</span>
                  <span className="t-mono t-dim" style={{ fontSize: 12 }}>+3 this week</span>
                </div>
              </div>
              <div style={{ marginTop: 6, color: 'var(--paper-dim)', fontSize: 13, fontFamily: 'var(--mono)' }}>
                <span className="t-green">$</span> 1,247.3 hours played &nbsp;·&nbsp; 12.1% completed &nbsp;·&nbsp; ~$3,420 estimated spend
              </div>
            </div>
            <div className="panel" style={{ padding: '14px 18px' }}>
              <div className="t-up t-faint" style={{ fontSize: 10 }}>system</div>
              <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 18px', fontSize: 12 }}>
                {[['STEAM','synced 4m','ok','var(--green)'],['PSN','synced 8m','ok','var(--green)'],['XBOX','synced 12m','ok','var(--green)'],['GOG','synced 1h','stale','var(--amber)']].map(([n,t,s,c]) => (
                  <React.Fragment key={n}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Plat p={n.slice(0,2)} /> <span className="t-dim">{n}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--paper-faint)' }}>
                      <span>{t}</span><span style={{ color: c }}>{s}</span>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>

          <div style={{ height: 28 }} />

          {/* main stats block */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20 }}>

            {/* left col: now playing + ascii */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* now playing card */}
              <div className="panel" style={{ padding: 20, display: 'grid', gridTemplateColumns: '120px 1fr', gap: 22 }}>
                <Cover w={120} h={160} label="HOLLOW KNIGHT: SILKSONG" dev="Team Cherry" year="’25" bright />
                <div>
                  <Marker>// session active · resumed 2h 14m ago</Marker>
                  <div style={{ marginTop: 10, fontSize: 28, lineHeight: 1.05, color: 'var(--paper)', letterSpacing: '-0.01em', fontWeight: 500 }}>
                    Hollow Knight: <span style={{ color: 'var(--paper-dim)' }}>Silksong</span>
                  </div>
                  <div className="t-mono t-dim" style={{ fontSize: 12, marginTop: 4 }}>Team Cherry · 2025 · Metroidvania</div>

                  <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(4, max-content)', gap: '4px 28px', fontSize: 12 }}>
                    <span className="t-up t-faint" style={{ fontSize: 10 }}>played</span>
                    <span className="t-up t-faint" style={{ fontSize: 10 }}>est. main</span>
                    <span className="t-up t-faint" style={{ fontSize: 10 }}>progress</span>
                    <span className="t-up t-faint" style={{ fontSize: 10 }}>last save</span>
                    <span className="t-tnum" style={{ color: 'var(--paper)' }}>16h 18m</span>
                    <span className="t-tnum t-dim">~42h</span>
                    <span className="t-tnum t-green">38.7%</span>
                    <span className="t-tnum t-dim">2h ago</span>
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <div className="prog green"><i style={{ width: '38.7%' }} /></div>
                    <div className="t-mono" style={{ fontSize: 10, color: 'var(--paper-faint)', display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                      <span>act 1 ━━━━━━━━━━ act 2 ━━━━╋━━━━━ act 3 ─────── final</span>
                      <span>achievements 24/63</span>
                    </div>
                  </div>

                  <div style={{ marginTop: 18, display: 'flex', gap: 10, alignItems: 'center' }}>
                    <Btn variant="primary"><Icon name="play" size={11} fill={true} /> resume</Btn>
                    <Btn>log session</Btn>
                    <Btn>+ note</Btn>
                    <span style={{ flex: 1 }} />
                    <Plat p="ST" lg /><span className="t-faint" style={{ fontSize: 11 }}>steam · 14.2h</span>
                    <Plat p="PS" lg /><span className="t-faint" style={{ fontSize: 11 }}>psn · 2.1h</span>
                  </div>
                </div>
              </div>

              {/* hours by platform — ascii bars */}
              <div className="panel" style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <Marker>// hours by platform · all-time</Marker>
                  <span className="t-mono t-faint" style={{ fontSize: 10 }}>1,247.3 h total</span>
                </div>
                <pre className="ascii t-dim" style={{ marginTop: 12, fontSize: 12, lineHeight: 1.55 }}>
{`STEAM  ████████████████████████████████████████  812.4 h   65.1%
PSN    ████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░  241.0 h   19.3%
XBOX   █████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  102.1 h    8.2%
GOG    ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   91.8 h    7.4%`}
                </pre>
              </div>

              {/* heatmap */}
              <div className="panel" style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
                  <Marker>// activity · last 24 weeks</Marker>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--paper-faint)' }}>
                    <span>less</span>
                    <div className="heat-cell" />
                    <div className="heat-cell l1" />
                    <div className="heat-cell l2" />
                    <div className="heat-cell l3" />
                    <div className="heat-cell l4" />
                    <div className="heat-cell l5" />
                    <span>more</span>
                  </div>
                </div>
                <Heatmap weeks={24} days={7} density={0.6} />
                <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--paper-faint)' }}>
                  <span>nov ’25</span><span>dec</span><span>jan ’26</span><span>feb</span><span>mar</span><span>apr</span><span>may</span>
                </div>
              </div>
            </div>

            {/* right col: stat grid */}
            <div className="panel" style={{ padding: 20 }}>
              <Marker>// the hoard · in numbers</Marker>
              <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--rule)', border: '1px solid var(--rule)' }}>
                {[
                  ['428','TOTAL OWNED','+3 wk','dim'],
                  ['52','COMPLETED','12.1%','green'],
                  ['18','PLAYING','active','green'],
                  ['286','BACKLOG','66.8%','amber'],
                  ['9','ON HOLD','paused',null],
                  ['11','DROPPED','sunk','red'],
                  ['62','WISHLIST','5 soon','amber'],
                  ['$3.4k','EST. SPEND','lifetime','dim'],
                ].map(([v,k,sub,tone],i) => (
                  <div key={i} style={{ background: 'var(--ink)', padding: '16px 16px 14px' }}>
                    <div className="t-mono t-tnum" style={{ fontSize: 28, fontWeight: 500, lineHeight: 1, color: tone === 'green' ? 'var(--green)' : tone === 'amber' ? 'var(--amber)' : tone === 'red' ? 'var(--red)' : 'var(--paper)' }}>{v}</div>
                    <div className="t-up t-faint" style={{ fontSize: 9, marginTop: 8 }}>{k}</div>
                    <div className="t-mono" style={{ fontSize: 10, color: 'var(--paper-dim)', marginTop: 2 }}>{sub}</div>
                  </div>
                ))}
              </div>

              {/* completion gauge */}
              <div style={{ marginTop: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <span className="t-up t-faint" style={{ fontSize: 10 }}>completion ratio</span>
                  <span className="t-tnum" style={{ fontSize: 11, color: 'var(--paper-dim)' }}>52 / 428</span>
                </div>
                <div className="gauge">
                  {Array.from({ length: 20 }).map((_, i) => (
                    <div key={i} className={`seg ${i < 2 ? 'on' : ''}`} />
                  ))}
                </div>
              </div>

              {/* genre breakdown */}
              <div style={{ marginTop: 18 }}>
                <div className="t-up t-faint" style={{ fontSize: 10, marginBottom: 8 }}>top genres</div>
                {[['action rpg', 86, 'var(--paper)'], ['indie / metroidvania', 64, 'var(--paper-dim)'], ['strategy', 41, 'var(--paper-dim)'], ['shooter', 38, 'var(--paper-dim)'], ['puzzle', 22, 'var(--paper-dim)']].map(([g, n, c]) => (
                  <div key={g} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', fontSize: 12 }}>
                    <span style={{ width: 130, color: c }}>{g}</span>
                    <div style={{ flex: 1, height: 3, background: 'var(--ink-2)', position: 'relative' }}>
                      <div style={{ height: '100%', width: `${n}%`, background: 'var(--paper-dim)' }} />
                    </div>
                    <span className="t-tnum t-faint" style={{ fontSize: 11, width: 28, textAlign: 'right' }}>{n}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* wishlist · dropping soon */}
          <div style={{ height: 28 }} />
          <div className="panel" style={{ padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <Marker>// wishlist · dropping soon</Marker>
                <div className="t-display" style={{ fontSize: 22, color: 'var(--paper)', marginTop: 6, letterSpacing: '0.04em' }}>
                  5 incoming <span className="t-amber" style={{ display: 'inline-flex', verticalAlign: '-0.1em' }}><Icon name="star" size={18} fill={true} /></span>
                </div>
              </div>
              <div className="t-faint" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>see full upcoming feed <Icon name="arrowR" size={11} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
              {[
                ['Pragmata', 'Capcom', 'MAY 14, 2026', '12d', 'PS·ST·XB', 'var(--amber)'],
                ['Death Stranding 2', 'Kojima Prod.', 'JUN 11, 2026', '40d', 'PS', 'var(--amber)'],
                ['Hades II 1.0', 'Supergiant', 'SEP 25, 2026', '146d', 'ST', 'var(--paper-dim)'],
                ['Silksong DLC', 'Team Cherry', 'OCT 11, 2026', '162d', 'ST·PS', 'var(--paper-dim)'],
                ['Replaced', 'Sad Cat', 'TBA Q4 2026', '~210d', 'XB·ST', 'var(--paper-faint)'],
              ].map(([t, dev, d, away, p, c], i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Cover w="100%" h={170} label={t.toUpperCase()} dev={dev} bright={i < 2} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span className="t-tnum" style={{ fontSize: 11, color: c }}>{d}</span>
                    <span className="t-tnum t-faint" style={{ fontSize: 10 }}>T-{away}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--paper)', lineHeight: 1.2 }}>{t}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: 4 }}>{p.split('·').map(x => <Plat key={x} p={x} />)}</div>
                    <span className="t-amber" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="star" size={11} fill={true} /> tracking</span>
                  </div>
                  {/* countdown gauge */}
                  <div className="gauge" style={{ marginTop: 2 }}>
                    {Array.from({ length: 12 }).map((_, k) => (
                      <div key={k} className={`seg ${k < (5 - i) ? 'amber' : ''}`} style={{ height: 4 }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

function DashMobile() {
  return (
    <MobileFrame>
      <MobileHeader title="hoard" sub="// sat 21:14 · synced 4m" right={<><span style={{ color: 'var(--green)' }}><Icon name="dotO" size={8} fill={true} /></span> <Icon name="menu" size={14} /></>} />
      <div className="thin-scroll" style={{ flex: 1, overflow: 'auto' }}>

        <div style={{ padding: '14px 16px 4px' }}>
          <Marker>// good evening, andrea</Marker>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 10 }}>
            <span className="t-display" style={{ fontSize: 56, lineHeight: 0.85 }}>428</span>
            <div>
              <div className="t-up t-faint" style={{ fontSize: 9 }}>games owned</div>
              <div className="t-mono t-dim" style={{ fontSize: 11 }}>+3 wk</div>
            </div>
          </div>
        </div>

        {/* now playing */}
        <div style={{ padding: '12px 16px' }}>
          <div className="panel" style={{ padding: 12, display: 'flex', gap: 12 }}>
            <Cover w={70} h={94} label="SILKSONG" dev="T. Cherry" bright />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 9, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="dotO" size={7} fill={true} /> now playing</div>
              <div style={{ fontSize: 14, lineHeight: 1.15, marginTop: 3 }}>Hollow Knight: Silksong</div>
              <div className="t-faint" style={{ fontSize: 10, marginTop: 2 }}>16h 18m · 2h ago · steam</div>
              <div className="prog green" style={{ marginTop: 8 }}><i style={{ width: '38.7%' }} /></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 10, color: 'var(--paper-faint)' }}>
                <span>act 2 · 38.7%</span><span>~42h</span>
              </div>
            </div>
          </div>
        </div>

        {/* stat tiles */}
        <div style={{ padding: '0 16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1, background: 'var(--rule)', border: '1px solid var(--rule)' }}>
            {[
              ['1,247h','PLAYTIME','dim'],
              ['12.1%','COMPLETED','green'],
              ['286','BACKLOG','amber'],
              ['$3.4k','EST. SPEND',null],
            ].map(([v, k, tone], i) => (
              <div key={i} style={{ background: 'var(--ink)', padding: '12px 12px 10px' }}>
                <div className="t-mono t-tnum" style={{ fontSize: 20, fontWeight: 500, color: tone === 'green' ? 'var(--green)' : tone === 'amber' ? 'var(--amber)' : 'var(--paper)' }}>{v}</div>
                <div className="t-up t-faint" style={{ fontSize: 9, marginTop: 4 }}>{k}</div>
              </div>
            ))}
          </div>
        </div>

        {/* hours by platform */}
        <div style={{ padding: '14px 16px 0' }}>
          <Marker>// hours by platform</Marker>
          <pre className="ascii t-dim" style={{ marginTop: 8, fontSize: 10, lineHeight: 1.55 }}>
{`STEAM ████████████████░░  812
PSN   █████░░░░░░░░░░░░░  241
XBOX  ██░░░░░░░░░░░░░░░░  102
GOG   █░░░░░░░░░░░░░░░░░   92`}
          </pre>
        </div>

        {/* activity */}
        <div style={{ padding: '14px 16px 0' }}>
          <Marker>// activity · 16 wks</Marker>
          <div style={{ marginTop: 8 }}>
            <Heatmap weeks={16} days={7} density={0.55} />
          </div>
        </div>

        {/* wishlist dropping soon */}
        <div style={{ padding: '18px 16px' }}>
          <Hr kind="dot" />
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 14, marginBottom: 10 }}>
            <Marker>// dropping soon · 5</Marker>
            <span className="t-amber" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="star" size={10} fill={true} /> all</span>
          </div>
          {[
            ['Pragmata','MAY 14','12d','PS·ST·XB','var(--amber)'],
            ['Death Stranding 2','JUN 11','40d','PS','var(--amber)'],
            ['Hades II 1.0','SEP 25','146d','ST',null],
            ['Silksong DLC','OCT 11','162d','ST·PS',null],
            ['Replaced','TBA Q4','~210d','XB·ST',null],
          ].map(([t, d, away, p, c], i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '36px 1fr auto', gap: 10, alignItems: 'center', padding: '8px 0', borderBottom: i < 4 ? '1px dotted var(--rule-bright)' : 'none' }}>
              <Cover w={36} h={48} label={t.split(' ')[0]} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, lineHeight: 1.1 }}>{t}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
                  <span className="t-tnum" style={{ fontSize: 10, color: c || 'var(--paper-dim)' }}>{d}</span>
                  <span className="t-faint" style={{ fontSize: 10 }}>· {p}</span>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="t-tnum" style={{ fontSize: 14, color: c || 'var(--paper)' }}>T-{away.replace('~','')}</div>
                <div className="t-faint" style={{ fontSize: 9 }}>days</div>
              </div>
            </div>
          ))}
        </div>

      </div>
      <MobileTabBar active="Dash" />
    </MobileFrame>
  );
}

Object.assign(window, { DashDesktop, DashMobile });
