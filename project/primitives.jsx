/* Hoard — shared primitives. Exported on window for cross-script use. */

/* SVG icon system — line icons, currentColor, 1.5px stroke. */
const ICON_PATHS = {
  star:   'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.8 6.6 19.5l1.2-6L3.3 9.3l6.1-.7L12 3z',
  starF:  'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.8 6.6 19.5l1.2-6L3.3 9.3l6.1-.7L12 3z',
  play:   'M6 4l14 8-14 8V4z',
  bell:   'M6 16V11a6 6 0 1 1 12 0v5l1.5 2H4.5L6 16zM10 21h4',
  plus:   'M12 5v14M5 12h14',
  cmd:    'M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6z',
  cog:    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
  arrowR: 'M5 12h14M13 6l6 6-6 6',
  arrowD: 'M12 5v14M6 13l6 6 6-6',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5.2-5.2',
  menu:   'M4 7h16M4 12h16M4 17h16',
  check:  'M5 12l5 5 9-11',
  x:      'M6 6l12 12M18 6l-12 12',
  pause:  'M8 5v14M16 5v14',
  circle: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  dotO:   'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  back:   'M15 6l-6 6 6 6',
  caret:  'M6 9l6 6 6-6',
  battery:'M3 8h15v8H3zM18 11v2h2v-2h-2zM5 10h11v4H5z',
  bolt:   'M13 2L4 14h7l-1 8 9-12h-7l1-8z',
};

function Icon({ name, size = 14, fill, stroke = 'currentColor', sw = 1.5, style, className }) {
  const d = ICON_PATHS[name];
  if (!d) return null;
  const filled = fill === true || name === 'starF';
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill={filled ? (fill === true ? 'currentColor' : fill) : 'none'}
      stroke={filled && fill === true ? 'none' : stroke}
      strokeWidth={sw} strokeLinecap="square" strokeLinejoin="miter"
      style={{ display: 'inline-block', verticalAlign: '-0.15em', flex: '0 0 auto', ...style }}
      className={className}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

const PLATFORMS = {
  ST: { code: 'ST', name: 'Steam' },
  PS: { code: 'PS', name: 'PSN' },
  XB: { code: 'XB', name: 'Xbox' },
  GG: { code: 'GG', name: 'GOG' },
};

const STATUS = {
  Playing:   { dot: 'var(--green)',       icon: 'play',   sigil: '[●]', shape: 'sq' },
  Backlog:   { dot: 'var(--paper-faint)', icon: 'circle', sigil: '[ ]', shape: 'sq' },
  Completed: { dot: 'var(--paper)',       icon: 'check',  sigil: '[x]', shape: 'sq' },
  'On Hold': { dot: 'var(--blue)',        icon: 'pause',  sigil: '[~]', shape: 'sq' },
  Dropped:   { dot: 'var(--red)',         icon: 'x',      sigil: '[/]', shape: 'sq' },
  Wishlist:  { dot: 'var(--amber)',       icon: 'star',   sigil: '[?]', shape: 'di' },
};

function StatusSigil({ s, label }) {
  const cfg = STATUS[s] || STATUS.Backlog;
  return (
    <span className="status-sigil">
      <span className={`dot ${cfg.shape}`} style={{ background: cfg.dot }} />
      {label !== false && <span>{s}</span>}
    </span>
  );
}

function Plat({ p, lg }) {
  return <span className={`plat ${lg ? 'lg' : ''}`}>{p}</span>;
}

function Cover({ w, h, label, year, dev, bright, style, children }) {
  const cls = `cover-ph ${bright ? 'bright' : ''}`;
  return (
    <div className={cls} style={{ width: w, height: h, ...style }}>
      <span className="corner">{year || ''}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, maxWidth: '100%' }}>
        <span style={{ color: 'var(--paper-dim)', fontSize: 9, fontWeight: 500, lineHeight: 1.1, letterSpacing: '0.05em' }}>{label}</span>
        {dev && <span style={{ fontSize: 7, opacity: 0.6 }}>{dev}</span>}
      </div>
      {children}
    </div>
  );
}

function Hr({ kind = 'dot', style }) {
  const cls = kind === 'solid' ? 'hr-solid'
    : kind === 'dash' ? 'hr-dash'
    : kind === 'double' ? 'hr-double'
    : 'hr-dot';
  return <div className={cls} style={style} />;
}

function Marker({ children, style }) {
  return <span className="marker" style={style}>{children}</span>;
}

function Chip({ children, on, tone, solid, style }) {
  const cls = ['chip', on ? 'on' : '', tone || '', solid ? 'solid' : ''].filter(Boolean).join(' ');
  return <span className={cls} style={style}>{children}</span>;
}

function Btn({ children, variant, sm, style, onClick }) {
  const cls = ['btn', variant || '', sm ? 'sm' : ''].filter(Boolean).join(' ');
  return <button className={cls} style={style} onClick={onClick}>{children}</button>;
}

function KV({ rows }) {
  return (
    <div className="kv">
      {rows.map(([k, v], i) => (
        <React.Fragment key={i}>
          <div className="k">{k}</div>
          <div>{v}</div>
        </React.Fragment>
      ))}
    </div>
  );
}

/* desktop chrome ---------------------------------------------------- */

function Sidebar({ active = 'Library' }) {
  return (
    <aside className="sidebar">
      <div style={{ padding: '0 22px 18px', display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span className="t-display" style={{ fontSize: 22, color: 'var(--paper)', letterSpacing: '0.04em' }}>hoard</span>
        <span className="t-faint" style={{ fontSize: 9 }}>v0.7</span>
      </div>
      <div className="group">// command</div>
      {[
        ['Dashboard', 'dotO'],
        ['Library',   'menu'],
        ['Upcoming',  'star'],
        ['Stats',     'bolt'],
        ['Random pick','circle'],
      ].map(([t, g]) => (
        <div key={t} className={`item ${active === t ? 'active' : ''}`}>
          <span className="glyph"><Icon name={g} size={12} /></span><span>{t}</span>
        </div>
      ))}
      <div className="group">// shelves</div>
      {[
        ['Playing', '18', 'var(--green)'],
        ['Backlog', '286', null],
        ['Completed', '52', null],
        ['On Hold', '9', null],
        ['Dropped', '11', null],
        ['Wishlist', '62', 'var(--amber)'],
      ].map(([t, n, c]) => (
        <div key={t} className="item">
          <span className="glyph" style={{ color: c || undefined }}><Icon name="dotO" size={8} fill={true} /></span>
          <span>{t}</span>
          <span className="count">{n}</span>
        </div>
      ))}
      <div className="group">// platforms</div>
      {[['Steam', 'ST', 'sync 4m'], ['PSN', 'PS', 'sync 8m'], ['Xbox', 'XB', 'sync 12m'], ['GOG', 'GG', 'sync 1h']].map(([t, p, s]) => (
        <div key={t} className="item">
          <span className="glyph"><Plat p={p} /></span>
          <span>{t}</span>
          <span className="count" style={{ color: 'var(--green)' }}><Icon name="dotO" size={8} fill={true} /></span>
        </div>
      ))}
      <div style={{ flex: 1 }} />
      <div style={{ padding: '14px 22px', borderTop: '1px solid var(--rule)', fontSize: 10, color: 'var(--paper-faint)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 22, height: 22, background: 'var(--ink-3)', border: '1px solid var(--rule-bright)' }} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ color: 'var(--paper)', fontSize: 11 }}>andrea</span>
          <span style={{ fontSize: 9 }}>since 2023</span>
        </div>
      </div>
    </aside>
  );
}

function TopBar({ crumbs = [], right }) {
  return (
    <div className="topbar">
      <span className="crumbs">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span style={{ margin: '0 8px', color: 'var(--paper-ghost)' }}>/</span>}
            {i === crumbs.length - 1 ? <b>{c}</b> : <span>{c}</span>}
          </React.Fragment>
        ))}
      </span>
      <div className="right">
        {right || (
          <>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="search" size={12} /> K</span>
            <span style={{ color: 'var(--green)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="dotO" size={8} fill={true} /> synced 4m ago</span>
            <span style={{ display: 'inline-flex' }}><Icon name="cog" size={13} /></span>
          </>
        )}
      </div>
    </div>
  );
}

/* mobile chrome ----------------------------------------------------- */

function MobileFrame({ children, dark = true, w = 360, h = 760, label }) {
  return (
    <div style={{
      width: w, height: h,
      background: dark ? 'var(--void)' : 'var(--paper)',
      color: dark ? 'var(--paper)' : 'var(--void)',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'var(--mono)',
      border: '1px solid var(--rule)',
      overflow: 'hidden',
      position: 'relative',
    }}>
      <div className="m-status">
        <span>9:41</span>
        <span style={{ color: 'var(--green)', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="dotO" size={7} fill={true} /> HOARD</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="battery" size={14} /> 100%</span>
      </div>
      {children}
    </div>
  );
}

function MobileTabBar({ active = 'Library' }) {
  const tabs = [
    ['Dash',    'dotO'],
    ['Library', 'menu'],
    ['Soon',    'star'],
    ['Stats',   'bolt'],
    ['Me',      'circle'],
  ];
  return (
    <div className="m-tabbar">
      {tabs.map(([t, g]) => (
        <div key={t} className={`item ${active === t ? 'active' : ''}`}>
          <span className="glyph"><Icon name={g} size={14} /></span>
          <span>{t}</span>
        </div>
      ))}
    </div>
  );
}

function MobileHeader({ title, sub, back, right }) {
  return (
    <div style={{
      padding: '8px 16px 14px',
      borderBottom: '1px solid var(--rule)',
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      background: 'var(--ink)',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        {back && <span style={{ fontSize: 16, color: 'var(--paper-dim)' }}>‹</span>}
        <div>
          <div className="t-display" style={{ fontSize: 18, lineHeight: 1, letterSpacing: '0.04em' }}>{title}</div>
          {sub && <div style={{ fontSize: 9, color: 'var(--paper-faint)', textTransform: 'uppercase', letterSpacing: '0.12em', marginTop: 4 }}>{sub}</div>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, color: 'var(--paper-dim)', fontSize: 13, alignItems: 'center' }}>
        {right || <><Icon name="search" size={14} /><Icon name="menu" size={14} /></>}
      </div>
    </div>
  );
}

/* heatmap ----------------------------------------------------------- */

function Heatmap({ weeks = 24, days = 7, density = 0.55 }) {
  // deterministic pseudo-random heatmap
  const cells = [];
  let seed = 7;
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < days; d++) {
      seed = (seed * 9301 + 49297) % 233280;
      const r = seed / 233280;
      let lvl = 0;
      if (r < density * 0.45) lvl = 1;
      if (r < density * 0.32) lvl = 2;
      if (r < density * 0.18) lvl = 3;
      if (r < density * 0.08) lvl = 4;
      if (r < density * 0.03) lvl = 5;
      cells.push(lvl);
    }
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${weeks}, 1fr)`, gap: 2 }}>
      {Array.from({ length: weeks }).map((_, w) => (
        <div key={w} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {Array.from({ length: days }).map((_, d) => {
            const lvl = cells[w * days + d];
            return <div key={d} className={`heat-cell ${lvl ? 'l' + lvl : ''}`} />;
          })}
        </div>
      ))}
    </div>
  );
}

/* mini barcode ------------------------------------------------------ */

function Barcode({ code = 'HRD-0042-ELDN-0026', height = 36 }) {
  const widths = [];
  let seed = 5;
  for (let i = 0; i < 80; i++) {
    seed = (seed * 9301 + 49297) % 233280;
    widths.push(1 + Math.floor((seed / 233280) * 3));
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div className="barcode" style={{ height }}>
        {widths.map((w, i) => i % 2 === 0
          ? <div key={i} className="bar" style={{ width: w }} />
          : <div key={i} style={{ width: w }} />
        )}
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.18em' }}>{code}</div>
    </div>
  );
}

Object.assign(window, {
  PLATFORMS, STATUS, ICON_PATHS,
  Icon,
  StatusSigil, Plat, Cover, Hr, Marker, Chip, Btn, KV,
  Sidebar, TopBar,
  MobileFrame, MobileTabBar, MobileHeader,
  Heatmap, Barcode,
});
