/**
 * One-time backfill: ensure every existing WishlistRelease has a paired
 * Game catalog row + UserGame(status=Wishlist) row.
 *
 * Background: until the wishlist-as-library work, starring a game on the
 * Releases page only created a WishlistRelease row. The Library Wishlist
 * shelf, the search overlay, and the /game/:id detail page all read from
 * UserGame and therefore couldn't see those rows. This script catches up
 * existing data so the toggle endpoint's new behavior (which writes both
 * tables atomically going forward) matches reality.
 *
 * Idempotent: skips wishlist rows where a UserGame already exists for
 * (userId, gameId), regardless of status. Only creates missing rows.
 */
import { config } from 'dotenv';
config({ path: new URL('../apps/api/.env', import.meta.url).pathname });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface Stats {
  scanned: number;
  gameCreated: number;
  userGameCreated: number;
  alreadyOk: number;
  errors: number;
}

async function main(): Promise<void> {
  const rows = await prisma.wishlistRelease.findMany({
    orderBy: { createdAt: 'asc' },
  });

  const stats: Stats = { scanned: 0, gameCreated: 0, userGameCreated: 0, alreadyOk: 0, errors: 0 };
  console.log(`scanning ${rows.length} wishlist releases…`);

  for (const w of rows) {
    stats.scanned += 1;
    try {
      // Catalog row: try create first so we can count creates vs updates
      // distinctly. Fall through to findUnique if a row already exists.
      let game;
      try {
        game = await prisma.game.create({
          data: {
            igdbId: w.igdbId,
            title: w.title,
            developer: w.developer,
            releaseYear: w.releaseDate?.getFullYear() ?? null,
            genres: w.genres,
            coverUrl: w.coverUrl,
          },
        });
        stats.gameCreated += 1;
      } catch {
        // Unique-constraint hit — Game already exists. Don't update, just fetch.
        game = await prisma.game.findUniqueOrThrow({ where: { igdbId: w.igdbId } });
      }

      // Has the user already got a UserGame for this game?
      const existing = await prisma.userGame.findUnique({
        where: { userId_gameId: { userId: w.userId, gameId: game.id } },
      });
      if (existing) {
        stats.alreadyOk += 1;
        continue;
      }

      // Create the missing UserGame as Wishlist. Inherit the WishlistRelease
      // createdAt as addedAt so the library shelf orders by when the user
      // actually starred the game.
      await prisma.userGame.create({
        data: {
          userId: w.userId,
          gameId: game.id,
          status: 'Wishlist',
          addedAt: w.createdAt,
        },
      });
      stats.userGameCreated += 1;
      console.log(`  + UserGame for "${w.title}" (igdb ${w.igdbId}, user ${w.userId})`);
    } catch (err) {
      stats.errors += 1;
      console.error(`  ! row ${w.id} (${w.title}):`, err);
    }
  }

  console.log('');
  console.log('done.');
  console.log(`  scanned:           ${stats.scanned}`);
  console.log(`  game rows created: ${stats.gameCreated}`);
  console.log(`  user games created:${stats.userGameCreated}`);
  console.log(`  already ok:        ${stats.alreadyOk}`);
  console.log(`  errors:            ${stats.errors}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
