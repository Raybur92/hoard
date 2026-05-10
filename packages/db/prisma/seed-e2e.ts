// E2E test database seed. Runs against the dedicated `hoard-test` Supabase
// project (see DATABASE_URL_TEST). Wipes existing data in dependency order
// then writes a deterministic fixture set:
//   - 3 users (admin / active / pending-with-request)
//   - 12 games shared as a catalog
//   - 12 UserGame rows under each ACTIVE user (admin + active = 24 total)
//   - HLTB rows on the 4 Backlog games
//   - 4 Platform rows (2 per ACTIVE user, all syncStatus='ok')
// Stable IDs throughout — specs assert against them by id.
//
// Plan: docs/E2E_RESTORATION_PLAN.md §4.2 + §4.6 step 6.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// bcrypt(12) of plaintext "e2e-test-only-do-not-use". Matches the cost
// the API uses (apps/api/src/routes/auth.ts). Hardcoded so the seed has
// no bcryptjs dependency. The fixture in apps/web/tests/e2e/fixtures.ts
// authenticates with this plaintext via process.env['E2E_TEST_PASSWORD'].
const E2E_PASSWORD_HASH = '$2b$12$609Lw3Q2FiC1uzE6WXBtK.KUF4EsozABPWjIC5vInufwaV0f72zme';

const USER_IDS = {
  admin: 'e2e-user-admin',
  active: 'e2e-user-active',
  pending: 'e2e-user-pending',
} as const;

async function main() {
  // Explicit acknowledgment guard. This script wipes the entire database
  // via deleteMany() before re-seeding — running it against prod would
  // delete all of Andrea's data. Supabase project refs are random slugs
  // so URL-based heuristics aren't reliable; require the operator to
  // type the ack flag instead.
  const url = process.env['DATABASE_URL'] ?? '';
  if (!url.includes('postgres')) {
    throw new Error('DATABASE_URL is not set or does not look like a Postgres URL.');
  }
  if (!process.env['I_KNOW_THIS_IS_THE_TEST_DB']) {
    throw new Error(
      'seed-e2e refuses to run without acknowledgment. This script wipes ALL\n' +
        'data via deleteMany() before re-seeding.\n\n' +
        'Re-run with I_KNOW_THIS_IS_THE_TEST_DB=1 once you have confirmed\n' +
        'DATABASE_URL points at hoard-test, NOT prod.',
    );
  }

  // Wipe in FK dependency order. Idempotent — safe to re-run.
  await prisma.platformLog.deleteMany();
  await prisma.hltbData.deleteMany();
  await prisma.userGame.deleteMany();
  await prisma.wishlistRelease.deleteMany();
  await prisma.platform.deleteMany();
  await prisma.inviteCode.deleteMany();
  await prisma.game.deleteMany();
  await prisma.user.deleteMany();

  const now = new Date();
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
  const minsAgo = (m: number) => new Date(now.getTime() - m * 60_000);

  // Users — 1 admin (matches Andrea's shape: ACTIVE + isAdmin), 1 plain
  // ACTIVE user (the default authenticated identity for E2E specs), 1
  // PENDING_INVITE with hasRequestedAccess for welcome-screen tests.
  await prisma.user.createMany({
    data: [
      {
        id: USER_IDS.admin,
        email: 'e2e-admin@hoard.test',
        name: 'e2e admin',
        password: E2E_PASSWORD_HASH,
        status: 'ACTIVE',
        isAdmin: true,
        createdAt: daysAgo(180),
      },
      {
        id: USER_IDS.active,
        email: 'e2e-active@hoard.test',
        name: 'e2e active user',
        password: E2E_PASSWORD_HASH,
        status: 'ACTIVE',
        isAdmin: false,
        createdAt: daysAgo(30),
      },
      {
        id: USER_IDS.pending,
        email: 'e2e-pending@hoard.test',
        name: null,
        password: E2E_PASSWORD_HASH,
        status: 'PENDING_INVITE',
        isAdmin: false,
        hasRequestedAccess: true,
        accessRequestMessage:
          'i would love to use hoard for tracking my collection. testing the welcome flow.',
        accessRequestedAt: daysAgo(2),
        createdAt: daysAgo(3),
      },
    ],
  });

  // Games — IGDB IDs in the 9001-9012 range, well clear of the prod seed's
  // 1001-1030 range so a side-by-side debug session never collides.
  await prisma.game.createMany({
    data: [
      {
        id: 'e2e-game-elden-ring',
        igdbId: 9001,
        title: 'Elden Ring',
        developer: 'FromSoftware',
        releaseYear: 2022,
        genres: ['Action RPG', 'Soulslike'],
      },
      {
        id: 'e2e-game-hollow-knight-silksong',
        igdbId: 9002,
        title: 'Hollow Knight: Silksong',
        developer: 'Team Cherry',
        releaseYear: 2025,
        genres: ['Metroidvania', 'Action-platformer'],
      },
      {
        id: 'e2e-game-disco-elysium',
        igdbId: 9003,
        title: 'Disco Elysium',
        developer: 'ZA/UM',
        releaseYear: 2019,
        genres: ['RPG', 'Detective'],
      },
      {
        id: 'e2e-game-tunic',
        igdbId: 9004,
        title: 'Tunic',
        developer: 'Andrew Shouldice',
        releaseYear: 2022,
        genres: ['Action-adventure', 'Indie'],
      },
      {
        id: 'e2e-game-rdr2',
        igdbId: 9005,
        title: 'Red Dead Redemption 2',
        developer: 'Rockstar Games',
        releaseYear: 2018,
        genres: ['Action-adventure', 'Open-world'],
      },
      {
        id: 'e2e-game-pentiment',
        igdbId: 9006,
        title: 'Pentiment',
        developer: 'Obsidian Entertainment',
        releaseYear: 2022,
        genres: ['Narrative', 'Historical'],
      },
      {
        id: 'e2e-game-hades',
        igdbId: 9007,
        title: 'Hades',
        developer: 'Supergiant Games',
        releaseYear: 2020,
        genres: ['Roguelite', 'Action'],
      },
      {
        id: 'e2e-game-stardew-valley',
        igdbId: 9008,
        title: 'Stardew Valley',
        developer: 'ConcernedApe',
        releaseYear: 2016,
        genres: ['Simulation', 'RPG'],
      },
      {
        id: 'e2e-game-outer-wilds',
        igdbId: 9009,
        title: 'Outer Wilds',
        developer: 'Mobius Digital',
        releaseYear: 2019,
        genres: ['Exploration', 'Mystery'],
      },
      {
        id: 'e2e-game-bg3',
        igdbId: 9010,
        title: "Baldur's Gate 3",
        developer: 'Larian Studios',
        releaseYear: 2023,
        genres: ['RPG', 'Strategy'],
      },
      {
        id: 'e2e-game-cyberpunk-2077',
        igdbId: 9011,
        title: 'Cyberpunk 2077',
        developer: 'CD Projekt RED',
        releaseYear: 2020,
        genres: ['Action RPG', 'Open-world'],
      },
      {
        id: 'e2e-game-replaced',
        igdbId: 9012,
        title: 'Replaced',
        developer: 'Sad Cat Studios',
        releaseYear: 2026,
        genres: ['Cyberpunk', 'Action'],
      },
    ],
  });

  // HLTB on the 4 Backlog games — anchors the
  // `Library / shows HLTB hint on backlog item` integration assertion.
  // Times in minutes (matches HltbData schema).
  await prisma.hltbData.createMany({
    data: [
      { gameId: 'e2e-game-elden-ring', mainStory: 3600, mainExtras: 5940, completionist: 7800 },
      { gameId: 'e2e-game-tunic', mainStory: 720, mainExtras: 960, completionist: 1200 },
      { gameId: 'e2e-game-rdr2', mainStory: 3000, mainExtras: 5100, completionist: 7800 },
      { gameId: 'e2e-game-pentiment', mainStory: 900, mainExtras: 1080, completionist: 1200 },
    ],
  });

  // UserGames — same 12-row library shape under each ACTIVE user. Status
  // spread (per user): 2 Playing / 4 Backlog / 3 Completed / 1 OnHold /
  // 1 Dropped / 1 Wishlist. All 6 GameStatus values represented; covers
  // shelf-rendering + now-playing + completion-ratio assertions.
  for (const userId of [USER_IDS.admin, USER_IDS.active] as const) {
    const prefix = userId === USER_IDS.admin ? 'e2e-ug-admin' : 'e2e-ug-active';
    await prisma.userGame.createMany({
      data: [
        // Playing (2)
        {
          id: `${prefix}-silksong`,
          userId,
          gameId: 'e2e-game-hollow-knight-silksong',
          status: 'Playing',
          playtimeByPlatform: { ST: 852 },
          lastPlayedAt: daysAgo(0),
          addedAt: daysAgo(90),
        },
        {
          id: `${prefix}-disco`,
          userId,
          gameId: 'e2e-game-disco-elysium',
          status: 'Playing',
          playtimeByPlatform: { ST: 1350 },
          lastPlayedAt: daysAgo(2),
          addedAt: daysAgo(120),
        },
        // Backlog (4 — all with HLTB)
        {
          id: `${prefix}-elden`,
          userId,
          gameId: 'e2e-game-elden-ring',
          status: 'Backlog',
          playtimeByPlatform: { PS: 252 },
          lastPlayedAt: daysAgo(330),
          addedAt: daysAgo(400),
          notes: 'got walloped by margit. nine times.',
        },
        {
          id: `${prefix}-tunic`,
          userId,
          gameId: 'e2e-game-tunic',
          status: 'Backlog',
          playtimeByPlatform: {},
          lastPlayedAt: null,
          addedAt: daysAgo(500),
        },
        {
          id: `${prefix}-rdr2`,
          userId,
          gameId: 'e2e-game-rdr2',
          status: 'Backlog',
          playtimeByPlatform: { ST: 120 },
          lastPlayedAt: daysAgo(240),
          addedAt: daysAgo(550),
        },
        {
          id: `${prefix}-pentiment`,
          userId,
          gameId: 'e2e-game-pentiment',
          status: 'Backlog',
          playtimeByPlatform: {},
          lastPlayedAt: null,
          addedAt: daysAgo(450),
        },
        // Completed (3 — with ratings)
        {
          id: `${prefix}-hades`,
          userId,
          gameId: 'e2e-game-hades',
          status: 'Completed',
          playtimeByPlatform: { ST: 3726 },
          lastPlayedAt: daysAgo(365),
          addedAt: daysAgo(600),
          rating: 10,
        },
        {
          id: `${prefix}-stardew`,
          userId,
          gameId: 'e2e-game-stardew-valley',
          status: 'Completed',
          playtimeByPlatform: { ST: 8808 },
          lastPlayedAt: daysAgo(60),
          addedAt: daysAgo(1200),
          rating: 9,
        },
        {
          id: `${prefix}-outerwilds`,
          userId,
          gameId: 'e2e-game-outer-wilds',
          status: 'Completed',
          playtimeByPlatform: { ST: 2040 },
          lastPlayedAt: daysAgo(730),
          addedAt: daysAgo(900),
          rating: 10,
        },
        // OnHold (1)
        {
          id: `${prefix}-bg3`,
          userId,
          gameId: 'e2e-game-bg3',
          status: 'OnHold',
          playtimeByPlatform: { ST: 5880 },
          lastPlayedAt: daysAgo(21),
          addedAt: daysAgo(365),
        },
        // Dropped (1)
        {
          id: `${prefix}-cyberpunk`,
          userId,
          gameId: 'e2e-game-cyberpunk-2077',
          status: 'Dropped',
          playtimeByPlatform: { GG: 672 },
          lastPlayedAt: daysAgo(730),
          addedAt: daysAgo(800),
        },
        // Wishlist (1)
        {
          id: `${prefix}-replaced`,
          userId,
          gameId: 'e2e-game-replaced',
          status: 'Wishlist',
          playtimeByPlatform: {},
          lastPlayedAt: null,
          addedAt: daysAgo(50),
        },
      ],
    });
  }

  // Platforms — 2 per ACTIVE user, all syncStatus='ok'. Pending user has
  // no platforms (matches a real PENDING_INVITE row's shape).
  await prisma.platform.createMany({
    data: [
      {
        id: 'e2e-platform-admin-st',
        userId: USER_IDS.admin,
        code: 'ST',
        syncable: true,
        syncStatus: 'ok',
        lastSyncAt: minsAgo(8),
        syncFrequency: 'HOURLY',
      },
      {
        id: 'e2e-platform-admin-ps',
        userId: USER_IDS.admin,
        code: 'PS',
        syncable: true,
        syncStatus: 'ok',
        lastSyncAt: minsAgo(12),
        syncFrequency: 'HOURLY',
      },
      {
        id: 'e2e-platform-active-st',
        userId: USER_IDS.active,
        code: 'ST',
        syncable: true,
        syncStatus: 'ok',
        lastSyncAt: minsAgo(6),
        syncFrequency: 'HOURLY',
      },
      {
        id: 'e2e-platform-active-ps',
        userId: USER_IDS.active,
        code: 'PS',
        syncable: true,
        syncStatus: 'ok',
        lastSyncAt: minsAgo(15),
        syncFrequency: 'HOURLY',
      },
    ],
  });

  const [users, games, userGames, platforms] = await Promise.all([
    prisma.user.count(),
    prisma.game.count(),
    prisma.userGame.count(),
    prisma.platform.count(),
  ]);
  console.log(
    `[seed-e2e] users=${users} games=${games} userGames=${userGames} platforms=${platforms}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
