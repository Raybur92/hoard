/**
 * Read-only inventory: every user registered in Hoard, with a quick
 * activity summary (game count, platform count, last activity).
 */
import { config } from 'dotenv';
config({ path: new URL('../apps/api/.env', import.meta.url).pathname });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      _count: {
        select: { userGames: true, platforms: true },
      },
    },
  });

  if (users.length === 0) {
    console.log('No users registered.');
    return;
  }

  console.log(`Total users: ${users.length}\n`);
  for (const u of users) {
    const since = new Date(u.createdAt).toISOString().slice(0, 10);
    const name = u.name ?? '(no display name)';
    console.log(`  ${u.email}`);
    console.log(`    id        : ${u.id}`);
    console.log(`    name      : ${name}`);
    console.log(`    joined    : ${since}`);
    console.log(`    games     : ${u._count.userGames}`);
    console.log(`    platforms : ${u._count.platforms}`);
    console.log('');
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
