// I3 of the invite-codes workstream (docs/INVITE_CODES_PLAN.md).
// Admin surface for managing invite codes and seeing who has signed up.
// Every route on this router stacks: requireUser → requireActive →
// requireAdmin. Non-admin requests get 404 with the canonical
// `{ error: 'Not found' }` body so the surface stays invisible.

import { Router } from 'express';
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@hoard/db';
import { requireUser } from '../middleware/user';
import { requireActive } from '../middleware/active';
import { requireAdmin } from '../middleware/admin';
import { generateCode } from '../lib/inviteCodes';
import { displayIdentity } from '../lib/displayIdentity';
import type {
  AdminUser,
  AdminInviteCode,
  PlatformCode,
} from '@hoard/types';

const router = Router();

router.use(requireUser, requireActive, requireAdmin);

// GET /api/admin/users
//
// Sort order: pending access-requests first (by accessRequestedAt desc
// — "freshest knock at the door first"), then everyone else by
// createdAt desc. The two-segment sort lets the UI render the
// "PENDING ACCESS REQUESTS" panel directly off the top of the list
// without a second query.
router.get('/admin/users', async (_req: Request, res: Response): Promise<void> => {
  const rows = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      steamId: true,
      createdAt: true,
      status: true,
      isAdmin: true,
      hasRequestedAccess: true,
      accessRequestMessage: true,
      accessRequestedAt: true,
      redeemedInviteCode: { select: { code: true, usedAt: true } },
      platforms: { select: { code: true } },
    },
  });

  const mapped: AdminUser[] = rows.map((u) => ({
    id: u.id,
    email: u.email,
    displayIdentity: displayIdentity({ email: u.email, name: u.name, steamId: u.steamId }),
    name: u.name,
    createdAt: u.createdAt.toISOString(),
    status: u.status,
    isAdmin: u.isAdmin,
    hasRequestedAccess: u.hasRequestedAccess,
    accessRequestMessage: u.accessRequestMessage,
    accessRequestedAt: u.accessRequestedAt?.toISOString() ?? null,
    redeemedCode: u.redeemedInviteCode
      ? {
          code: u.redeemedInviteCode.code,
          usedAt: u.redeemedInviteCode.usedAt?.toISOString() ?? '',
        }
      : null,
    platforms: {
      count: u.platforms.length,
      codes: u.platforms.map((p) => p.code as PlatformCode),
    },
  }));

  // Two-segment sort — pending requests first, then by join date.
  mapped.sort((a, b) => {
    const aPending = a.hasRequestedAccess && a.status === 'PENDING_INVITE';
    const bPending = b.hasRequestedAccess && b.status === 'PENDING_INVITE';
    if (aPending && !bPending) return -1;
    if (!aPending && bPending) return 1;
    if (aPending && bPending) {
      const aT = a.accessRequestedAt ? Date.parse(a.accessRequestedAt) : 0;
      const bT = b.accessRequestedAt ? Date.parse(b.accessRequestedAt) : 0;
      return bT - aT;
    }
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });

  res.json({ users: mapped });
});

// GET /api/admin/invite-codes
//
// Sort order: unused first (the admin's working set), then used codes
// most-recently-redeemed first. Used codes are kept in the response
// for audit (who redeemed what when), not just hidden after redemption.
router.get('/admin/invite-codes', async (_req: Request, res: Response): Promise<void> => {
  const rows = await prisma.inviteCode.findMany({
    include: {
      usedBy: { select: { id: true, email: true, name: true, steamId: true } },
    },
  });

  const mapped: AdminInviteCode[] = rows.map((c) => ({
    id: c.id,
    code: c.code,
    note: c.note,
    createdAt: c.createdAt.toISOString(),
    usedAt: c.usedAt?.toISOString() ?? null,
    usedBy: c.usedBy
      ? {
          id: c.usedBy.id,
          email: c.usedBy.email,
          displayIdentity: displayIdentity({ email: c.usedBy.email, name: c.usedBy.name, steamId: c.usedBy.steamId }),
        }
      : null,
  }));

  mapped.sort((a, b) => {
    if (!a.usedAt && b.usedAt) return -1;
    if (a.usedAt && !b.usedAt) return 1;
    if (a.usedAt && b.usedAt) return Date.parse(b.usedAt) - Date.parse(a.usedAt);
    // Both unused — most-recently-created first.
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });

  res.json({ codes: mapped });
});

// POST /api/admin/invite-codes
//
// Generates a new code. Optional 100-char note (admin-only,
// stored alongside the code so the admin can remember who it's for).
// Retries up to 5 times on the unique-constraint collision (P2002) —
// 32^8 ≈ 1.1T keyspace makes 5 collisions a near-impossibility, so
// hitting the cap means a real bug worth surfacing.
const createCodeSchema = z.object({
  note: z.string().max(100).optional(),
});

router.post('/admin/invite-codes', async (req: Request, res: Response): Promise<void> => {
  const parsed = createCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }
  const { note } = parsed.data;

  const MAX_ATTEMPTS = 5;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = generateCode();
    try {
      const created = await prisma.inviteCode.create({
        data: { code, ...(note !== undefined ? { note } : {}) },
      });
      const body: AdminInviteCode = {
        id: created.id,
        code: created.code,
        note: created.note,
        createdAt: created.createdAt.toISOString(),
        usedAt: null,
        usedBy: null,
      };
      res.status(201).json({ code: body });
      return;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Collision on the unique `code` index — try again with a
        // fresh random code.
        continue;
      }
      throw err;
    }
  }

  // Fell through MAX_ATTEMPTS without minting a unique code. This is
  // statistically improbable (probability ~10^-46 per attempt for 50
  // existing codes); if it ever happens, a real bug is at play.
  console.error('[admin] invite-code generator hit max collision retries — investigate');
  res.status(500).json({ error: 'Failed to generate a unique invite code' });
});

// DELETE /api/admin/invite-codes/:id
//
// Allowed only when the code is unused. Used codes can't be revoked
// because the user is already ACTIVE — there's nothing to roll back
// here (status flip lives on the User row, not the code).
router.delete('/admin/invite-codes/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };

  const existing = await prisma.inviteCode.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (existing.usedById) {
    res.status(409).json({ error: 'CODE_ALREADY_USED' });
    return;
  }

  await prisma.inviteCode.delete({ where: { id } });
  res.status(204).send();
});

export default router;
