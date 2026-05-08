/**
 * One-shot rollback snapshot of the User table.
 * Dumps every column of every row to a JSON file. Used as the rollback
 * reference before destructive ops on the User table (e.g. the pre-step
 * of the invite-codes workstream, 2026-05-08).
 *
 * SENSITIVE OUTPUT — the JSON includes bcrypt password hashes, googleId,
 * and steamId. This file MUST stay out of git history. The default
 * convention is to write to `docs/runbooks/`, which is gitignored.
 *
 * USAGE:
 *   npx tsx scripts/snapshot-users.ts                            # default: docs/runbooks/users-snapshot-<ISO>.json
 *   npx tsx scripts/snapshot-users.ts <output-path>              # explicit path (must be gitignored)
 */
import { config } from 'dotenv';
config({ path: new URL('../apps/api/.env', import.meta.url).pathname });

import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const prisma = new PrismaClient();

function isGitIgnored(path: string): boolean {
  try {
    execFileSync('git', ['check-ignore', '-q', path], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const explicitOut = process.argv[2];
  const defaultOut = `docs/runbooks/users-snapshot-${new Date().toISOString().slice(0, 10)}.json`;
  const out = explicitOut ?? defaultOut;
  const abs = resolve(out);

  // Refuse to write a sensitive dump to a tracked path. `git check-ignore`
  // returns 0 when the path is ignored, non-zero otherwise; this catches
  // the common mistake of dumping into a tracked directory by accident.
  if (!isGitIgnored(abs)) {
    console.error(`refusing to write to a non-gitignored path: ${out}`);
    console.error('this script writes bcrypt hashes + OAuth IDs — point it at docs/runbooks/ or another gitignored location.');
    process.exit(2);
  }

  mkdirSync(dirname(abs), { recursive: true });

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
  });

  const payload = {
    snapshotAt: new Date().toISOString(),
    count: users.length,
    users,
  };

  writeFileSync(abs, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`Wrote ${users.length} user(s) to ${out}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
