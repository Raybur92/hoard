/* Mock data matching the design files exactly — same game titles, same numbers */

export interface MockPlatformSync {
  code: string;
  label: string;
  syncedAt: string;
  status: 'ok' | 'stale' | 'error';
}

export interface MockShelfGame {
  t: string;
  dev: string;
  y: string;
  p: string;
  h: string;
  last: string;
  pct: number;
  hltb?: number;
}

export interface MockShelf {
  name: string;
  count: number;
  tone: 'green' | 'amber' | 'red' | null;
  items: MockShelfGame[];
}

export interface MockUpcomingGame {
  t: string;
  dev: string;
  d: string;
  dow: string;
  m: string;
  day: string;
  away: number;
  p: string;
  tag: 'wishlisted' | null;
  genre: string;
  hype: number;
}

export interface MockBacklogPick {
  t: string;
  dev: string;
  y: string;
  p: string;
  hltb: number;
  h: string;
}

// Dashboard
export const MOCK_PLATFORM_SYNC: MockPlatformSync[] = [
  { code: 'ST', label: 'STEAM', syncedAt: 'synced 4m', status: 'ok' },
  { code: 'PS', label: 'PSN',   syncedAt: 'synced 8m', status: 'ok' },
  { code: 'XB', label: 'XBOX',  syncedAt: 'synced 12m', status: 'ok' },
  { code: 'GG', label: 'GOG',   syncedAt: 'synced 1h', status: 'stale' },
];

export const MOCK_STATS = {
  totalOwned: 428,
  weeklyAdded: 3,
  playtimeTotal: 1247.3,
  completionPct: 12.1,
  estimatedSpend: 3420,
  shelves: {
    completed: 52,
    playing:   18,
    backlog:   286,
    onHold:    9,
    dropped:   11,
    wishlist:  62,
  },
  completionRatio: { filled: 2, total: 20 },
  genres: [
    { name: 'action rpg',           count: 86 },
    { name: 'indie / metroidvania',  count: 64 },
    { name: 'strategy',             count: 41 },
    { name: 'shooter',              count: 38 },
    { name: 'puzzle',               count: 22 },
  ],
  playtimeByPlatform: [
    { code: 'STEAM', hours: 812.4, pct: 65.1 },
    { code: 'PSN',   hours: 241.0, pct: 19.3 },
    { code: 'XBOX',  hours: 102.1, pct: 8.2 },
    { code: 'GOG',   hours: 91.8,  pct: 7.4 },
  ],
};

export const MOCK_NOW_PLAYING = {
  t: 'Hollow Knight: Silksong',
  shortTitle: 'Silksong',
  dev: 'Team Cherry',
  y: '2025',
  genre: 'Metroidvania',
  played: '16h 18m',
  hltbMain: '~42h',
  progress: 38.7,
  lastSave: '2h ago',
  platforms: [
    { code: 'ST', label: 'steam', h: '14.2h' },
    { code: 'PS', label: 'psn',   h: '2.1h' },
  ],
};

export const MOCK_WISHLIST_COUNTDOWN = [
  { t: 'Pragmata',         dev: 'Capcom',       date: 'MAY 14, 2026', away: '12d',   p: 'PS·ST·XB', urgent: true },
  { t: 'Death Stranding 2', dev: 'Kojima Prod.', date: 'JUN 11, 2026', away: '40d',   p: 'PS',       urgent: true },
  { t: 'Hades II 1.0',     dev: 'Supergiant',   date: 'SEP 25, 2026', away: '146d',  p: 'ST',       urgent: false },
  { t: 'Silksong DLC',     dev: 'Team Cherry',  date: 'OCT 11, 2026', away: '162d',  p: 'ST·PS',    urgent: false },
  { t: 'Replaced',         dev: 'Sad Cat',      date: 'TBA Q4 2026',  away: '~210d', p: 'XB·ST',    urgent: false },
];

// Backlog picker — weighted toward shorter HLTB and already-started games
export const MOCK_BACKLOG_PICK: MockBacklogPick = {
  t: 'Citizen Sleeper',
  dev: 'Jump Over the Age',
  y: '2022',
  p: 'ST',
  hltb: 7,
  h: '—',
};

// Library shelves
export const MOCK_SHELVES: MockShelf[] = [
  {
    name: 'Now Playing', count: 18, tone: 'green',
    items: [
      { t: 'Hollow Knight: Silksong', dev: 'Team Cherry',      y: '2025', p: 'ST', h: '16.3h', last: '2h',  pct: 38 },
      { t: 'Disco Elysium',          dev: 'ZA/UM',            y: '2019', p: 'GG', h: '22.5h', last: '1d',  pct: 64 },
      { t: 'Outer Wilds',            dev: 'Mobius',           y: '2019', p: 'ST', h: '8.2h',  last: '4d',  pct: 22 },
      { t: 'Rim World',              dev: 'Ludeon',           y: '2018', p: 'ST', h: '142.0h', last: '6d', pct: 80 },
      { t: 'Blasphemous II',         dev: 'The Game Kitchen', y: '2023', p: 'PS', h: '4.1h',  last: '2w',  pct: 12 },
      { t: 'Crosscode',              dev: 'Radical Fish',     y: '2018', p: 'ST', h: '11.8h', last: '3w',  pct: 28 },
    ],
  },
  {
    name: 'Backlog', count: 286, tone: null,
    items: [
      { t: 'Elden Ring',         dev: 'FromSoftware',       y: '2022', p: 'PS', h: '4.2h', last: '11mo',  pct: 7,  hltb: 60 },
      { t: 'Tunic',              dev: 'Andrew Shouldice',   y: '2022', p: 'ST', h: '—',    last: 'never', pct: 0,  hltb: 12 },
      { t: 'Control',            dev: 'Remedy',             y: '2019', p: 'XB', h: '0.4h', last: '6mo',   pct: 1,  hltb: 14 },
      { t: 'Death Stranding',    dev: 'Kojima Prod.',       y: '2019', p: 'PS', h: '—',    last: 'never', pct: 0,  hltb: 41 },
      { t: 'SOMA',               dev: 'Frictional',         y: '2015', p: 'GG', h: '—',    last: 'never', pct: 0,  hltb: 9  },
      { t: 'Red Dead 2',         dev: 'Rockstar',           y: '2018', p: 'ST', h: '2.0h', last: '8mo',   pct: 2,  hltb: 50 },
      { t: 'Pentiment',          dev: 'Obsidian',           y: '2022', p: 'XB', h: '—',    last: 'never', pct: 0,  hltb: 15 },
      { t: 'Citizen Sleeper',    dev: 'Jump Over the Age',  y: '2022', p: 'ST', h: '—',    last: 'never', pct: 0,  hltb: 7  },
    ],
  },
  {
    name: 'Completed', count: 52, tone: null,
    items: [
      { t: 'Hades',                      dev: 'Supergiant',    y: '2020', p: 'ST', h: '62.1h',  last: '1y',  pct: 100 },
      { t: 'Stardew Valley',             dev: 'ConcernedApe',  y: '2016', p: 'ST', h: '146.8h', last: '2mo', pct: 100 },
      { t: 'Inscryption',                dev: 'Daniel Mullins', y: '2021', p: 'ST', h: '9.6h',  last: '1y',  pct: 100 },
      { t: 'Undertale',                  dev: 'Toby Fox',      y: '2015', p: 'ST', h: '11.4h',  last: '3y',  pct: 100 },
      { t: 'Outer Wilds',                dev: 'Mobius',        y: '2019', p: 'ST', h: '34.0h',  last: '2y',  pct: 100 },
      { t: 'Return of the Obra Dinn',    dev: 'Lucas Pope',    y: '2018', p: 'ST', h: '13.2h',  last: '2y',  pct: 100 },
    ],
  },
  {
    name: 'On Hold', count: 9, tone: null,
    items: [
      { t: "Baldur's Gate 3", dev: 'Larian',  y: '2023', p: 'ST', h: '98.0h', last: '3w',  pct: 56 },
      { t: 'Borderlands 3',   dev: 'Gearbox', y: '2019', p: 'XB', h: '12.0h', last: '5mo', pct: 18 },
      { t: 'Halo Infinite',   dev: '343',     y: '2021', p: 'XB', h: '6.4h',  last: '1y',  pct: 24 },
    ],
  },
  {
    name: 'Dropped', count: 11, tone: 'red',
    items: [
      { t: 'Cyberpunk 2077', dev: 'CDPR',    y: '2020', p: 'GG', h: '11.2h', last: '2y', pct: 18 },
      { t: 'Destiny 2',      dev: 'Bungie',  y: '2017', p: 'ST', h: '40.0h', last: '3y', pct: 0  },
      { t: 'Anthem',         dev: 'BioWare', y: '2019', p: 'XB', h: '4.0h',  last: '4y', pct: 0  },
    ],
  },
  {
    name: 'Wishlist', count: 62, tone: 'amber',
    items: [
      { t: 'Pragmata',         dev: 'Capcom',                y: '2026', p: 'PS', h: '—', last: 'soon', pct: 0 },
      { t: 'Death Stranding 2', dev: 'Kojima Prod.',         y: '2026', p: 'PS', h: '—', last: 'soon', pct: 0 },
      { t: 'Replaced',         dev: 'Sad Cat',               y: '2026', p: 'XB', h: '—', last: 'TBA',  pct: 0 },
      { t: 'Hades II',         dev: 'Supergiant',            y: '2026', p: 'ST', h: '—', last: 'sep',  pct: 0 },
      { t: 'NORCO',            dev: 'Geography of Robots',   y: '2022', p: 'GG', h: '—', last: '—',    pct: 0 },
    ],
  },
];

// Upcoming releases
export const MOCK_UPCOMING: MockUpcomingGame[] = [
  { t: 'Pragmata',             dev: 'Capcom',             d: 'MAY 14, 2026', dow: 'THU', m: 'MAY', day: '14', away: 12,  p: 'PS·ST·XB', tag: 'wishlisted', genre: 'Sci-fi · Puzzle-shooter', hype: 5 },
  { t: 'Crimson Desert',       dev: 'Pearl Abyss',        d: 'MAY 21, 2026', dow: 'THU', m: 'MAY', day: '21', away: 19,  p: 'PS·ST·XB', tag: null,          genre: 'Open-world ARPG',        hype: 3 },
  { t: 'Mina the Hollower',    dev: 'Yacht Club',         d: 'JUN 02, 2026', dow: 'TUE', m: 'JUN', day: '02', away: 31,  p: 'ST·PS·XB', tag: null,          genre: 'Action-adventure',       hype: 4 },
  { t: 'Death Stranding 2',    dev: 'Kojima Productions', d: 'JUN 11, 2026', dow: 'THU', m: 'JUN', day: '11', away: 40,  p: 'PS',       tag: 'wishlisted', genre: 'Open-world action',      hype: 5 },
  { t: 'Project Bloom',        dev: 'Annapurna',          d: 'JUL 09, 2026', dow: 'THU', m: 'JUL', day: '09', away: 68,  p: 'ST·PS',    tag: null,          genre: 'Adventure',              hype: 2 },
  { t: 'Hades II 1.0',         dev: 'Supergiant',         d: 'SEP 25, 2026', dow: 'FRI', m: 'SEP', day: '25', away: 146, p: 'ST',       tag: 'wishlisted', genre: 'Roguelite',              hype: 5 },
  { t: 'Silksong: Lost Verses', dev: 'Team Cherry',       d: 'OCT 11, 2026', dow: 'SAT', m: 'OCT', day: '11', away: 162, p: 'ST·PS',    tag: 'wishlisted', genre: 'Metroidvania DLC',       hype: 4 },
  { t: 'Replaced',             dev: 'Sad Cat Studios',    d: 'TBA Q4 2026',  dow: '—',   m: 'TBA', day: '—',  away: 210, p: 'XB·ST',    tag: 'wishlisted', genre: 'Cyberpunk action',       hype: 4 },
];

// Game detail — Elden Ring
export const MOCK_GAME_DETAIL = {
  title: 'Elden Ring',
  dev: 'FromSoftware',
  y: '2022',
  genre: 'Action RPG · Soulslike',
  status: 'Backlog',
  rating: null as number | null,
  addedAt: '2023-04-08',
  synopsis: 'A vast realm shattered by the Elden Ring, the Lands Between sprawl across six demigod-ruled regions. As a Tarnished, you ride the open world in search of the runes that will make you Elden Lord — or you die a great deal trying.',
  stats: {
    logged: '4.2',
    hltbMain: '~60',
    complete: '~7%',
    lastTouched: '11mo',
  },
  platforms: [
    { code: 'ST', name: 'Steam',         h: '0.0', sub: 'never launched',          color: 'var(--paper-faint)' },
    { code: 'PS', name: 'PlayStation 5', h: '4.2', sub: '11mo ago · 2 trophies',   color: 'var(--paper)' },
  ],
  hltb: {
    mainStory:    { label: 'MAIN STORY',    value: '60h',  sub: 'community avg', you: false },
    mainExtras:   { label: 'MAIN + EXTRAS', value: '99h',  sub: 'community avg', you: false },
    completionist:{ label: 'COMPLETIONIST', value: '130h', sub: 'community avg', you: false },
    yourPlaytime: { label: 'YOUR PLAYTIME', value: '4.2h', sub: 'across PS · ST', you: true  },
    pctOfMain:    '7%',
    stillOwed:    '55.8h',
  },
  notes: [
    'got walloped by margit. nine times.',
    'try again w/ str build?? maybe summon for the cheese.',
    'the music in stormveil is unreal.',
  ],
  noteDate: '2024-06-12',
  receipt: {
    ref: 'HRD-0042',
    barcode: 'HRD-0042-ELDN-2022-FROM',
    date: '2026-05-02 · 21:14',
  },
};
