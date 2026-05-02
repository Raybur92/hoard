import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Fixed IDs — stable across re-seeds so E2E tests can use known routes
const USER_ID = 'seed-andrea';
const ELDEN_RING_UG_ID = 'seed-elden-ring';

async function main() {
  // Wipe existing seed data in dependency order
  await prisma.hltbData.deleteMany();
  await prisma.userGame.deleteMany();
  await prisma.wishlistRelease.deleteMany();
  await prisma.platform.deleteMany();
  await prisma.game.deleteMany();
  await prisma.user.deleteMany({ where: { id: USER_ID } });

  // User
  await prisma.user.create({
    data: { id: USER_ID, email: 'andrea@hoard.app', name: 'andrea' },
  });

  // Platforms
  const now = new Date();
  const mins = (m: number) => new Date(now.getTime() - m * 60_000);
  await prisma.platform.createMany({
    data: [
      { userId: USER_ID, code: 'ST', syncable: true, syncStatus: 'ok',   lastSyncAt: mins(4)  },
      { userId: USER_ID, code: 'PS', syncable: true, syncStatus: 'ok',   lastSyncAt: mins(8)  },
      { userId: USER_ID, code: 'XB', syncable: true, syncStatus: 'ok',   lastSyncAt: mins(12) },
      { userId: USER_ID, code: 'GG', syncable: true, syncStatus: 'stale', lastSyncAt: mins(60) },
    ],
  });

  // Games
  const games = await prisma.game.createManyAndReturn({
    data: [
      { id: 'g-silksong',    igdbId: 1001, title: 'Hollow Knight: Silksong', developer: 'Team Cherry',            releaseYear: 2025, genres: ['Metroidvania', 'Action-platformer'] },
      { id: 'g-elden',       igdbId: 1002, title: 'Elden Ring',              developer: 'FromSoftware',           releaseYear: 2022, genres: ['Action RPG', 'Soulslike'] },
      { id: 'g-disco',       igdbId: 1003, title: 'Disco Elysium',           developer: 'ZA/UM',                  releaseYear: 2019, genres: ['RPG', 'Detective'] },
      { id: 'g-rimworld',    igdbId: 1004, title: 'RimWorld',                developer: 'Ludeon Studios',         releaseYear: 2018, genres: ['Colony sim', 'Strategy'] },
      { id: 'g-blasphemous2',igdbId: 1005, title: 'Blasphemous II',          developer: 'The Game Kitchen',       releaseYear: 2023, genres: ['Metroidvania', 'Action'] },
      { id: 'g-crosscode',   igdbId: 1006, title: 'CrossCode',               developer: 'Radical Fish Games',     releaseYear: 2018, genres: ['Action RPG', 'Indie'] },
      { id: 'g-citizen',     igdbId: 1007, title: 'Citizen Sleeper',         developer: 'Jump Over the Age',      releaseYear: 2022, genres: ['RPG', 'Narrative'] },
      { id: 'g-tunic',       igdbId: 1008, title: 'Tunic',                   developer: 'Andrew Shouldice',       releaseYear: 2022, genres: ['Action-adventure', 'Indie'] },
      { id: 'g-control',     igdbId: 1009, title: 'Control',                 developer: 'Remedy Entertainment',   releaseYear: 2019, genres: ['Action-adventure', 'Shooter'] },
      { id: 'g-ds1',         igdbId: 1010, title: 'Death Stranding',         developer: 'Kojima Productions',     releaseYear: 2019, genres: ['Action', 'Open-world'] },
      { id: 'g-soma',        igdbId: 1011, title: 'SOMA',                    developer: 'Frictional Games',       releaseYear: 2015, genres: ['Horror', 'Sci-fi'] },
      { id: 'g-rdr2',        igdbId: 1012, title: 'Red Dead Redemption 2',   developer: 'Rockstar Games',         releaseYear: 2018, genres: ['Action-adventure', 'Open-world'] },
      { id: 'g-pentiment',   igdbId: 1013, title: 'Pentiment',               developer: 'Obsidian Entertainment', releaseYear: 2022, genres: ['Narrative', 'Historical'] },
      { id: 'g-hades',       igdbId: 1014, title: 'Hades',                   developer: 'Supergiant Games',       releaseYear: 2020, genres: ['Roguelite', 'Action'] },
      { id: 'g-stardew',     igdbId: 1015, title: 'Stardew Valley',          developer: 'ConcernedApe',           releaseYear: 2016, genres: ['Simulation', 'RPG'] },
      { id: 'g-inscryption',  igdbId: 1016, title: 'Inscryption',            developer: 'Daniel Mullins Games',   releaseYear: 2021, genres: ['Deckbuilder', 'Horror'] },
      { id: 'g-undertale',   igdbId: 1017, title: 'Undertale',               developer: 'Toby Fox',               releaseYear: 2015, genres: ['RPG', 'Indie'] },
      { id: 'g-outerwilds',  igdbId: 1018, title: 'Outer Wilds',             developer: 'Mobius Digital',         releaseYear: 2019, genres: ['Exploration', 'Mystery'] },
      { id: 'g-obra',        igdbId: 1019, title: 'Return of the Obra Dinn', developer: 'Lucas Pope',             releaseYear: 2018, genres: ['Puzzle', 'Mystery'] },
      { id: 'g-bg3',         igdbId: 1020, title: "Baldur's Gate 3",         developer: 'Larian Studios',         releaseYear: 2023, genres: ['RPG', 'Strategy'] },
      { id: 'g-borderlands3',igdbId: 1021, title: 'Borderlands 3',           developer: 'Gearbox Software',       releaseYear: 2019, genres: ['Shooter', 'RPG'] },
      { id: 'g-halo',        igdbId: 1022, title: 'Halo Infinite',           developer: '343 Industries',         releaseYear: 2021, genres: ['Shooter', 'Action'] },
      { id: 'g-cyberpunk',   igdbId: 1023, title: 'Cyberpunk 2077',          developer: 'CD Projekt RED',         releaseYear: 2020, genres: ['Action RPG', 'Open-world'] },
      { id: 'g-destiny2',    igdbId: 1024, title: 'Destiny 2',               developer: 'Bungie',                 releaseYear: 2017, genres: ['Shooter', 'MMO'] },
      { id: 'g-anthem',      igdbId: 1025, title: 'Anthem',                  developer: 'BioWare',                releaseYear: 2019, genres: ['Action RPG', 'Shooter'] },
      { id: 'g-pragmata',    igdbId: 1026, title: 'Pragmata',                developer: 'Capcom',                 releaseYear: 2026, genres: ['Sci-fi', 'Puzzle-shooter'] },
      { id: 'g-ds2',         igdbId: 1027, title: 'Death Stranding 2',       developer: 'Kojima Productions',     releaseYear: 2026, genres: ['Action', 'Open-world'] },
      { id: 'g-replaced',    igdbId: 1028, title: 'Replaced',                developer: 'Sad Cat Studios',        releaseYear: 2026, genres: ['Cyberpunk', 'Action'] },
      { id: 'g-hades2',      igdbId: 1029, title: 'Hades II',                developer: 'Supergiant Games',       releaseYear: 2026, genres: ['Roguelite', 'Action'] },
      { id: 'g-norco',       igdbId: 1030, title: 'NORCO',                   developer: 'Geography of Robots',    releaseYear: 2022, genres: ['Adventure', 'Narrative'] },
    ],
  });

  void games; // used only for type-checking

  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

  // UserGames — Playing (5)
  await prisma.userGame.createMany({
    data: [
      { id: 'seed-silksong',    userId: USER_ID, gameId: 'g-silksong',     status: 'Playing',   playtimeByPlatform: { ST: 852, PS: 126 }, lastPlayedAt: daysAgo(0),  addedAt: daysAgo(90) },
      { id: 'seed-disco',       userId: USER_ID, gameId: 'g-disco',        status: 'Playing',   playtimeByPlatform: { GG: 1350 },          lastPlayedAt: daysAgo(1),  addedAt: daysAgo(120) },
      { id: 'seed-rimworld',    userId: USER_ID, gameId: 'g-rimworld',     status: 'Playing',   playtimeByPlatform: { ST: 8520 },          lastPlayedAt: daysAgo(6),  addedAt: daysAgo(365) },
      { id: 'seed-blasphemous2',userId: USER_ID, gameId: 'g-blasphemous2', status: 'Playing',   playtimeByPlatform: { PS: 246 },           lastPlayedAt: daysAgo(14), addedAt: daysAgo(60) },
      { id: 'seed-crosscode',   userId: USER_ID, gameId: 'g-crosscode',    status: 'Playing',   playtimeByPlatform: { ST: 708 },           lastPlayedAt: daysAgo(21), addedAt: daysAgo(80) },
    ],
  });

  // UserGames — Backlog (8)
  await prisma.userGame.createMany({
    data: [
      { id: ELDEN_RING_UG_ID,   userId: USER_ID, gameId: 'g-elden',        status: 'Backlog',   playtimeByPlatform: { PS: 252 },           lastPlayedAt: daysAgo(330), addedAt: daysAgo(400), notes: 'got walloped by margit. nine times.\ntry again w/ str build?? maybe summon for the cheese.\nthe music in stormveil is unreal.' },
      { id: 'seed-tunic',       userId: USER_ID, gameId: 'g-tunic',        status: 'Backlog',   playtimeByPlatform: {},                    lastPlayedAt: null,         addedAt: daysAgo(500) },
      { id: 'seed-control',     userId: USER_ID, gameId: 'g-control',      status: 'Backlog',   playtimeByPlatform: { XB: 24 },            lastPlayedAt: daysAgo(180), addedAt: daysAgo(600) },
      { id: 'seed-ds1',         userId: USER_ID, gameId: 'g-ds1',          status: 'Backlog',   playtimeByPlatform: {},                    lastPlayedAt: null,         addedAt: daysAgo(700) },
      { id: 'seed-soma',        userId: USER_ID, gameId: 'g-soma',         status: 'Backlog',   playtimeByPlatform: {},                    lastPlayedAt: null,         addedAt: daysAgo(800) },
      { id: 'seed-rdr2',        userId: USER_ID, gameId: 'g-rdr2',         status: 'Backlog',   playtimeByPlatform: { ST: 120 },           lastPlayedAt: daysAgo(240), addedAt: daysAgo(550) },
      { id: 'seed-pentiment',   userId: USER_ID, gameId: 'g-pentiment',    status: 'Backlog',   playtimeByPlatform: {},                    lastPlayedAt: null,         addedAt: daysAgo(450) },
      { id: 'seed-citizen',     userId: USER_ID, gameId: 'g-citizen',      status: 'Backlog',   playtimeByPlatform: {},                    lastPlayedAt: null,         addedAt: daysAgo(300) },
    ],
  });

  // UserGames — Completed (6)
  await prisma.userGame.createMany({
    data: [
      { id: 'seed-hades',       userId: USER_ID, gameId: 'g-hades',        status: 'Completed', playtimeByPlatform: { ST: 3726 },          lastPlayedAt: daysAgo(365), addedAt: daysAgo(600), rating: 10 },
      { id: 'seed-stardew',     userId: USER_ID, gameId: 'g-stardew',      status: 'Completed', playtimeByPlatform: { ST: 8808 },          lastPlayedAt: daysAgo(60),  addedAt: daysAgo(1200), rating: 9 },
      { id: 'seed-inscryption', userId: USER_ID, gameId: 'g-inscryption',  status: 'Completed', playtimeByPlatform: { ST: 576 },           lastPlayedAt: daysAgo(365), addedAt: daysAgo(700), rating: 9 },
      { id: 'seed-undertale',   userId: USER_ID, gameId: 'g-undertale',    status: 'Completed', playtimeByPlatform: { ST: 684 },           lastPlayedAt: daysAgo(1095),addedAt: daysAgo(1400), rating: 10 },
      { id: 'seed-outerwilds',  userId: USER_ID, gameId: 'g-outerwilds',   status: 'Completed', playtimeByPlatform: { ST: 2040 },          lastPlayedAt: daysAgo(730), addedAt: daysAgo(900), rating: 10 },
      { id: 'seed-obra',        userId: USER_ID, gameId: 'g-obra',         status: 'Completed', playtimeByPlatform: { ST: 792 },           lastPlayedAt: daysAgo(730), addedAt: daysAgo(900), rating: 9 },
    ],
  });

  // UserGames — On Hold (3)
  await prisma.userGame.createMany({
    data: [
      { id: 'seed-bg3',         userId: USER_ID, gameId: 'g-bg3',          status: 'OnHold',   playtimeByPlatform: { ST: 5880 },          lastPlayedAt: daysAgo(21),  addedAt: daysAgo(365) },
      { id: 'seed-borderlands3',userId: USER_ID, gameId: 'g-borderlands3', status: 'OnHold',   playtimeByPlatform: { XB: 720 },           lastPlayedAt: daysAgo(150), addedAt: daysAgo(500) },
      { id: 'seed-halo',        userId: USER_ID, gameId: 'g-halo',         status: 'OnHold',   playtimeByPlatform: { XB: 384 },           lastPlayedAt: daysAgo(365), addedAt: daysAgo(700) },
    ],
  });

  // UserGames — Dropped (3)
  await prisma.userGame.createMany({
    data: [
      { id: 'seed-cyberpunk',   userId: USER_ID, gameId: 'g-cyberpunk',    status: 'Dropped',   playtimeByPlatform: { GG: 672 },           lastPlayedAt: daysAgo(730), addedAt: daysAgo(800) },
      { id: 'seed-destiny2',    userId: USER_ID, gameId: 'g-destiny2',     status: 'Dropped',   playtimeByPlatform: { ST: 2400 },          lastPlayedAt: daysAgo(1095),addedAt: daysAgo(1300) },
      { id: 'seed-anthem',      userId: USER_ID, gameId: 'g-anthem',       status: 'Dropped',   playtimeByPlatform: { XB: 240 },           lastPlayedAt: daysAgo(1460),addedAt: daysAgo(1500) },
    ],
  });

  // UserGames — Wishlist (5)
  await prisma.userGame.createMany({
    data: [
      { id: 'seed-pragmata-ug', userId: USER_ID, gameId: 'g-pragmata',    status: 'Wishlist',  playtimeByPlatform: {}, addedAt: daysAgo(200) },
      { id: 'seed-ds2-ug',      userId: USER_ID, gameId: 'g-ds2',         status: 'Wishlist',  playtimeByPlatform: {}, addedAt: daysAgo(180) },
      { id: 'seed-replaced-ug', userId: USER_ID, gameId: 'g-replaced',    status: 'Wishlist',  playtimeByPlatform: {}, addedAt: daysAgo(100) },
      { id: 'seed-hades2-ug',   userId: USER_ID, gameId: 'g-hades2',      status: 'Wishlist',  playtimeByPlatform: {}, addedAt: daysAgo(150) },
      { id: 'seed-norco-ug',    userId: USER_ID, gameId: 'g-norco',       status: 'Wishlist',  playtimeByPlatform: {}, addedAt: daysAgo(50) },
    ],
  });

  // HLTB data (for backlog games, in minutes)
  await prisma.hltbData.createMany({
    data: [
      { gameId: 'g-elden',      mainStory: 3600, mainExtras: 5940, completionist: 7800 },
      { gameId: 'g-citizen',    mainStory: 420,  mainExtras: 600,  completionist: 720  },
      { gameId: 'g-tunic',      mainStory: 720,  mainExtras: 960,  completionist: 1200 },
      { gameId: 'g-control',    mainStory: 840,  mainExtras: 1200, completionist: 1500 },
      { gameId: 'g-ds1',        mainStory: 2460, mainExtras: 3300, completionist: 4200 },
      { gameId: 'g-soma',       mainStory: 540,  mainExtras: 660,  completionist: 780  },
      { gameId: 'g-rdr2',       mainStory: 3000, mainExtras: 5100, completionist: 7800 },
      { gameId: 'g-pentiment',  mainStory: 900,  mainExtras: 1080, completionist: 1200 },
      { gameId: 'g-silksong',   mainStory: 2520, mainExtras: 3600, completionist: 4800 },
    ],
  });

  // Wishlist releases (upcoming screen) — dates relative to seed time
  const daysFromNow = (d: number) => new Date(now.getTime() + d * 86_400_000);
  await prisma.wishlistRelease.createMany({
    data: [
      { userId: USER_ID, igdbId: 1026, title: 'Pragmata',          developer: 'Capcom',              releaseDate: daysFromNow(12),  releaseDateCategory: 'exact', platforms: ['PS5', 'Steam', 'Xbox'], genres: ['Sci-fi', 'Puzzle-shooter'], hype: 5, synopsis: 'A futuristic action game set in a dystopian New York.' },
      { userId: USER_ID, igdbId: 9999, title: 'Crimson Desert',    developer: 'Pearl Abyss',         releaseDate: daysFromNow(19),  releaseDateCategory: 'exact', platforms: ['PS5', 'Steam', 'Xbox'], genres: ['Open-world ARPG'],          hype: 3, synopsis: null },
      { userId: USER_ID, igdbId: 9998, title: 'Mina the Hollower', developer: 'Yacht Club Games',    releaseDate: daysFromNow(31),  releaseDateCategory: 'exact', platforms: ['Steam', 'PS5', 'Xbox'], genres: ['Action-adventure'],         hype: 4, synopsis: null },
      { userId: USER_ID, igdbId: 1027, title: 'Death Stranding 2', developer: 'Kojima Productions', releaseDate: daysFromNow(40),  releaseDateCategory: 'exact', platforms: ['PS5'],                  genres: ['Action', 'Open-world'],     hype: 5, synopsis: null },
      { userId: USER_ID, igdbId: 1029, title: 'Hades II 1.0',      developer: 'Supergiant Games',   releaseDate: daysFromNow(146), releaseDateCategory: 'exact', platforms: ['Steam'],                genres: ['Roguelite'],                hype: 5, synopsis: null },
      { userId: USER_ID, igdbId: 1028, title: 'Replaced',          developer: 'Sad Cat Studios',    releaseDate: null,             releaseDateCategory: 'Q4',    platforms: ['Xbox', 'Steam'],        genres: ['Cyberpunk', 'Action'],      hype: 4, synopsis: null },
    ],
  });

  const total = await prisma.userGame.count({ where: { userId: USER_ID } });
  console.log(`[seed] created user seed-andrea with ${total} games`);
  console.log(`[seed] elden ring UserGame id: ${ELDEN_RING_UG_ID}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
