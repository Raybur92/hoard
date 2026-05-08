import type { Request, Response, NextFunction } from 'express';
import { prisma } from '@hoard/db';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      // Populated by requireActive when the user passes the gate. Routes
      // downstream can read isAdmin / status without re-querying. Currently
      // only consumed by I3 admin routes; widen as needed.
      user?: { id: string; status: 'PENDING_INVITE' | 'ACTIVE'; isAdmin: boolean };
    }
  }
}

/**
 * Closed-beta gate. Sits AFTER requireUser; reads req.userId, looks up
 * the User row, returns 403 PENDING_INVITE if the user hasn't redeemed
 * an invite code yet. Active users pass through with req.user populated.
 *
 * Exempt routes (per docs/INVITE_CODES_PLAN.md §4 audit):
 *   GET  /api/auth/me           — frontend hydrates the welcome screen
 *   POST /api/auth/logout       — always allowed
 *   DELETE /api/auth/me         — pending users' escape hatch
 *   POST /api/auth/redeem-invite — the unblocking endpoint itself
 *   POST /api/auth/request-access — the unblocking endpoint itself
 *
 * Every other authenticated route stacks requireActive after requireUser.
 *
 * Performance: one Prisma findUnique per gated request. Negligible against
 * pgbouncer in-region (~1ms); could be replaced with a JWT-embedded status
 * field later if the per-request lookup becomes a bottleneck.
 */
export async function requireActive(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.userId) {
    // Defensive: requireActive should always sit after requireUser. If
    // req.userId is missing, the auth chain is misconfigured.
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, status: true, isAdmin: true, hasRequestedAccess: true },
  });

  if (!user) {
    // The JWT is valid but the user no longer exists — likely a deleted
    // account whose cookie hasn't expired. Same response as requireUser's
    // bad-token path: 401 so the client clears state and bounces to login.
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  if (user.status !== 'ACTIVE') {
    res.status(403).json({ error: 'PENDING_INVITE', hasRequestedAccess: user.hasRequestedAccess });
    return;
  }

  req.user = { id: user.id, status: user.status, isAdmin: user.isAdmin };
  next();
}
