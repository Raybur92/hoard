// Playwright globalSetup — runs ONCE before any test, against the test DB.
//
// CLEANUP CONTRACT — three layers, ordered by precedence:
//
//   1. PRIMARY: afterEach inside welcome.integration.spec.ts deletes the
//      fresh user via DELETE /api/auth/me. Per-test cleanup.
//
//   2. SAFETY NET (this file): globalSetup deletes any User WHERE
//      email LIKE 'e2e-welcome-%@hoard.test' AND createdAt > 1h ago.
//      Catches ghosts from crashed tests, killed runs, or aborted CI jobs
//      where afterEach didn't get a chance to run. The 1-hour window
//      preserves recent ghosts during active debug — anyone inspecting a
//      previous-test's User row in psql before the next run keeps that
//      access.
//
//   3. ESCAPE HATCH (manual): if a really old ghost survives both layers
//      (e.g., the seed prefix changed and the LIKE query no longer
//      matches), nuke directly:
//        DELETE FROM "User" WHERE email LIKE 'e2e-welcome-%@hoard.test';
//      Use sparingly; >1h preservation exists for a reason.
//
// PSQL GOTCHA (for contributors running the manual layers via psql):
//   This file uses Prisma — Prisma handles the pgbouncer=true URL param
//   correctly. But psql/libpq rejects `?pgbouncer=true&connection_limit=5`
//   with "invalid URI query parameter pgbouncer". Strip the query string
//   from the test DB URL before passing to psql:
//     PSQL_URL="${DATABASE_URL_TEST%%\?*}"
//   CLAUDE.md operational gotcha + verification recipe in
//   docs/E2E_RESTORATION_PLAN.md §E2.4.

import type { FullConfig } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const url = process.env['DATABASE_URL_TEST'];
  if (!url) {
    throw new Error(
      'DATABASE_URL_TEST is required by global-setup.ts. Set it in apps/web/.env.test ' +
        '(local) or as a GitHub Actions secret (CI). See docs/E2E_RESTORATION_PLAN.md §4.6 step 5.',
    );
  }

  // Pass DATABASE_URL_TEST explicitly to PrismaClient. globalSetup runs
  // BEFORE the dev:api webServer's env block applies, so process.env.
  // DATABASE_URL isn't set yet at this point — we have to wire the URL
  // through the datasources override.
  const prisma = new PrismaClient({
    datasources: { db: { url } },
  });

  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const result = await prisma.user.deleteMany({
      where: {
        email: { startsWith: 'e2e-welcome-', endsWith: '@hoard.test' },
        createdAt: { lt: oneHourAgo },
      },
    });
    if (result.count > 0) {
      console.log(`[global-setup] ghost-purge: deleted ${result.count} stale e2e-welcome-* users`);
    }
  } finally {
    await prisma.$disconnect();
  }
}
