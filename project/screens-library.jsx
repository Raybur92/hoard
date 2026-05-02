/* Hoard — Library (desktop + mobile) — shelves by status */

const SHELVES = [
  {
    name: 'Now Playing', count: 18, tone: 'green',
    items: [
      { t: 'Hollow Knight: Silksong', dev: 'Team Cherry', y: '2025', p: 'ST', h: '16.3h', last: '2h', pct: 38 },
      { t: 'Disco Elysium', dev: 'ZA/UM', y: '2019', p: 'GG', h: '22.5h', last: '1d', pct: 64 },
      { t: 'Outer Wilds', dev: 'Mobius', y: '2019', p: 'ST', h: '8.2h', last: '4d', pct: 22 },
      { t: 'Rim World', dev: 'Ludeon', y: '2018', p: 'ST', h: '142.0h', last: '6d', pct: 80 },
      { t: 'Blasphemous II', dev: 'The Game Kitchen', y: '2023', p: 'PS', h: '4.1h', last: '2w', pct: 12 },
      { t: 'Crosscode', dev: 'Radical Fish', y: '2018', p: 'ST', h: '11.8h', last: '3w', pct: 28 },
    ],
  },
  {
    name: 'Backlog', count: 286, tone: null,
    items: [
      { t: 'Elden Ring', dev: 'FromSoftware', y: '2022', p: 'PS', h: '4.2h', last: '11mo', pct: 7,  hltb: 60 },
      { t: 'Tunic', dev: 'Andrew Shouldice', y: '2022', p: 'ST', h: '—', last: 'never', pct: 0, hltb: 12 },
      { t: 'Control', dev: 'Remedy', y: '2019', p: 'XB', h: '0.4h', last: '6mo', pct: 1, hltb: 14 },
      { t: 'Death Stranding', dev: 'Kojima Prod.', y: '2019', p: 'PS', h: '—', last: 'never', pct: 0, hltb: 41 },
      { t: 'SOMA', dev: 'Frictional', y: '2015', p: 'GG', h: '—', last: 'never', pct: 0, hltb: 9 },
      { t: 'Red Dead 2', dev: 'Rockstar', y: '2018', p: 'ST', h: '2.0h', last: '8mo', pct: 2, hltb: 50 },
      { t: 'Pentiment', dev: 'Obsidian', y: '2022', p: 'XB', h: '—', last: 'never', pct: 0, hltb: 15 },
      { t: 'Citizen Sleeper', dev: 'Jump Over the Age', y: '2022', p: 'ST', h: '—', last: 'never', pct: 0, hltb: 7 },
    ],
  },
  {
    name: 'Completed', count: 52, tone: null,
    items: [
      { t: 'Hades', dev: 'Supergiant', y: '2020', p: 'ST', h: '62.1h', last: '1y', pct: 100 },
      { t: 'Stardew Valley', dev: 'ConcernedApe', y: '2016', p: 'ST', h: '146.8h', last: '2mo', pct: 100 },
      { t: 'Inscryption', dev: 'Daniel Mullins', y: '2021', p: 'ST', h: '9.6h', last: '1y', pct: 100 },
      { t: 'Undertale', dev: 'Toby Fox', y: '2015', p: 'ST', h: '11.4h', last: '3y', pct: 100 },
      { t: 'Outer Wilds', dev: 'Mobius', y: '2019', p: 'ST', h: '34.0h', last: '2y', pct: 100 },
      { t: 'Return of the Obra Dinn', dev: 'Lucas Pope', y: '2018', p: 'ST', h: '13.2h', last: '2y', pct: 100 },
    ],
  },
  {
    name: 'On Hold', count: 9, tone: null,
    items: [
      { t: "Baldur's Gate 3", dev: 'Larian', y: '2023', p: 'ST', h: '98.0h', last: '3w', pct: 56 },
      { t: 'Borderlands 3', dev: 'Gearbox', y: '2019', p: 'XB', h: '12.0h', last: '5mo', pct: 18 },
      { t: 'Halo Infinite', dev: '343', y: '2021', p: 'XB', h: '6.4h', last: '1y', pct: 24 },
    ],
  },
  {
    name: 'Dropped', count: 11, tone: 'red',
    items: [
      { t: 'Cyberpunk 2077', dev: 'CDPR', y: '2020', p: 'GG', h: '11.2h', last: '2y', pct: 18 },
      { t: 'Destiny 2', dev: 'Bungie', y: '2017', p: 'ST', h: '40.0h', last: '3y', pct: 0 },
      { t: 'Anthem', dev: 'BioWare', y: '2019', p: 'XB', h: '4.0h', last: '4y', pct: 0 },
    ],
  },
  {
    name: 'Wishlist', count: 62, tone: 'amber',
    items: [
      { t: 'Pragmata', dev: 'Capcom', y: '2026', p: 'PS', h: '—', last: 'soon', pct: 0 },
      { t: 'Death Stranding 2', dev: 'Kojima Prod.', y: '2026', p: 'PS', h: '—', last: 'soon', pct: 0 },
      { t: 'Replaced', dev: 'Sad Cat', y: '2026', p: 'XB', h: '—', last: 'TBA', pct: 0 },
      { t: 'Hades II', dev: 'Supergiant', y: '2026', p: 'ST', h: '—', last: 'sep', pct: 0 },
      { t: 'NORCO', dev: 'Geography of Robots', y: '2022', p: 'GG', h: '—', last: '—', pct: 0 },
    ],
  },
];

function ShelfItem({ g, w = 130, h = 174, isBacklog }) {
  const tone = g.pct === 100 ? 'var(--paper)' : g.pct > 0 ? 'var(--green)' : 'var(--paper-faint)';
  return (
    <div style={{ width: w, flex: '0 0 auto' }}>
      <div style={{ position: 'relative' }}>
        <Cover w={w} h={h} label={g.t.toUpperCase()} dev={g.dev} year={`’${g.y.slice(2)}`} bright={g.pct > 0} />
        <div style={{ position: 'absolute', top: 6, right: 6 }}>
          <Plat p={g.p} />
        </div>
        {isBacklog && g.hltb != null && (
          <div style={{ position: 'absolute', bottom: 4, left: 4, padding: '2px 5px', background: 'rgba(0,0,0,0.78)', border: '1px solid var(--rule-bright)', fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.04em', color: 'var(--paper-dim)' }}>
            <span style={{ color: 'var(--paper-faint)', fontSize: 8 }}>HLTB </span>~{g.hltb}h
          </div>
        )}
        {g.pct > 0 && (
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: 'rgba(0,0,0,0.4)' }}>
            <div style={{ height: '100%', width: `${g.pct}%`, background: tone }} />
          </div>
        )}
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--paper)', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.t}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: 9, color: 'var(--paper-faint)' }}>
        <span className="t-tnum">{g.h}</span>
        <span className="t-tnum">{g.last}</span>
      </div>
    </div>
  );
}

function Shelf({ idx, name, count, items, tone, w = 130, h = 174 }) {
  const isBacklog = name === 'Backlog';
  const accent = tone === 'green' ? 'var(--green)' : tone === 'amber' ? 'var(--amber)' : tone === 'red' ? 'var(--red)' : 'var(--paper)';
  return (
    <div style={{ padding: '24px 0' }}>
      <div className="shelf-label">
        <span className="num" style={{ color: accent }}>{String(idx).padStart(2, '0')}</span>
        <span className="name">{name}</span>
        <span className="t-mono t-faint" style={{ fontSize: 11 }}>· {count} titles</span>
        <span className="total" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>scroll <Icon name="arrowR" size={11} /></span>
      </div>
      {/* shelf "rail" */}
      <div style={{ display: 'flex', gap: 16, overflow: 'hidden', position: 'relative' }}>
        {items.map((g, i) => <ShelfItem key={i} g={g} w={w} h={h} isBacklog={isBacklog} />)}
        {/* "more" stub */}
        <div style={{ width: w, flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--rule-bright)', height: h, color: 'var(--paper-faint)', fontSize: 11, gap: 6 }}>
          <span style={{ fontSize: 22 }}>+{count - items.length}</span>
          <span className="t-up" style={{ fontSize: 9 }}>more</span>
        </div>
      </div>
      {/* shelf physical line */}
      <div style={{ height: 4, background: 'var(--rule-bright)', marginTop: 10, position: 'relative' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 4, height: 1, background: 'var(--rule)' }} />
      </div>
    </div>
  );
}

function LibraryDesktop() {
  return (
    <div className="hoard-screen hoard-noise" style={{ width: 1440, height: 900, display: 'flex' }}>
      <Sidebar active="Library" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar crumbs={['hoard', 'library']} />

        {/* filter bar */}
        <div style={{ padding: '20px 32px 14px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div className="field" style={{ width: 320 }}>
            <span className="pre">$</span>
            <span style={{ color: 'var(--paper)' }}>find</span>
            <span style={{ color: 'var(--paper-faint)' }}>428 games · type to filter</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--paper-faint)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="search" size={11} /> K</span>
          </div>
          <Hr kind="solid" style={{ width: 1, height: 24, background: 'var(--rule)' }} />
          <span className="t-up t-faint" style={{ fontSize: 10 }}>view</span>
          <Chip on>shelves</Chip>
          <Chip>grid</Chip>
          <Chip>list</Chip>
          <Hr kind="solid" style={{ width: 1, height: 24, background: 'var(--rule)' }} />
          <span className="t-up t-faint" style={{ fontSize: 10 }}>plat</span>
          <Chip on>all</Chip>
          <Chip><Plat p="ST" /> 312</Chip>
          <Chip><Plat p="PS" /> 78</Chip>
          <Chip><Plat p="XB" /> 52</Chip>
          <Chip><Plat p="GG" /> 41</Chip>
          <span style={{ flex: 1 }} />
          <span className="t-mono t-faint" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>sort: last played <Icon name="arrowD" size={10} /></span>
        </div>

        {/* shelves */}
        <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '0 32px 40px' }}>
          {SHELVES.map((s, i) => <Shelf key={s.name} idx={i + 1} {...s} />)}
        </div>
      </div>
    </div>
  );
}

function MobileShelf({ idx, name, count, items, tone }) {
  const accent = tone === 'green' ? 'var(--green)' : tone === 'amber' ? 'var(--amber)' : tone === 'red' ? 'var(--red)' : 'var(--paper)';
  const isBacklog = name === 'Backlog';
  return (
    <div style={{ padding: '14px 0 18px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '0 16px' }}>
        <span className="t-display" style={{ fontSize: 18, color: accent, lineHeight: 0.9 }}>{String(idx).padStart(2, '0')}</span>
        <span className="t-up" style={{ fontSize: 12, letterSpacing: '0.14em' }}>{name}</span>
        <span className="t-mono t-faint" style={{ fontSize: 10 }}>· {count}</span>
        <span style={{ flex: 1 }} />
        <span className="t-faint" style={{ fontSize: 10 }}>see all ›</span>
      </div>
      <div className="thin-scroll" style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '12px 16px 0' }}>
        {items.slice(0, 6).map((g, i) => (
          <div key={i} style={{ width: 84, flex: '0 0 auto' }}>
            <div style={{ position: 'relative' }}>
              <Cover w={84} h={112} label={g.t.split(/[: ]/)[0].toUpperCase()} bright={g.pct > 0} />
              <div style={{ position: 'absolute', top: 4, right: 4 }}><Plat p={g.p} /></div>
              {g.pct > 0 && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: 'rgba(0,0,0,0.3)' }}>
                <div style={{ height: '100%', width: `${g.pct}%`, background: g.pct === 100 ? 'var(--paper)' : 'var(--green)' }} />
              </div>}
            </div>
            <div style={{ fontSize: 10, marginTop: 5, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.t}</div>
            <div style={{ fontSize: 9, color: 'var(--paper-faint)', marginTop: 1, display: 'flex', justifyContent: 'space-between', gap: 4 }}>
              <span>{g.h}</span>
              {isBacklog && g.hltb != null && <span style={{ color: 'var(--paper-dim)' }}>~{g.hltb}h</span>}
            </div>
          </div>
        ))}
      </div>
      <div style={{ height: 3, background: 'var(--rule-bright)', margin: '10px 16px 0' }} />
    </div>
  );
}

function LibraryMobile() {
  return (
    <MobileFrame>
      <MobileHeader title="shelves" sub="// 428 titles · 4 platforms" />
      <div style={{ padding: '10px 16px 0', display: 'flex', gap: 6, overflowX: 'auto' }}>
        <Chip on>all</Chip>
        <Chip><Plat p="ST" /></Chip>
        <Chip><Plat p="PS" /></Chip>
        <Chip><Plat p="XB" /></Chip>
        <Chip><Plat p="GG" /></Chip>
        <Chip><Icon name="arrowD" size={10} style={{ marginRight: 4 }} />last played</Chip>
      </div>
      <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', marginTop: 6 }}>
        {SHELVES.map((s, i) => <MobileShelf key={s.name} idx={i + 1} {...s} />)}
      </div>
      <MobileTabBar active="Library" />
    </MobileFrame>
  );
}

Object.assign(window, { LibraryDesktop, LibraryMobile });
