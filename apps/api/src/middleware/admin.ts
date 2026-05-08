import type { Request, Response, NextFunction } from 'express';

/**
 * Admin gate. Sits AFTER requireUser + requireActive; reads req.user
 * (populated by requireActive). Returns 404 (NOT 403) when the user
 * isn't an admin so the admin surface stays invisible to non-admins
 * — same body shape as the canonical project 404 (`{ error: 'Not
 * found' }`) used by routes/games.ts and routes/upcoming.ts. From a
 * caller's perspective a non-admin GET to /api/admin/users is
 * indistinguishable from a GET to /api/nonsense.
 *
 * Defensive 401 if req.user is somehow missing — that means the
 * middleware was misconfigured (no requireActive in front), and we
 * shouldn't pretend to be a 404 in that case because a real bug needs
 * to surface as a real bug.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  if (req.user.isAdmin !== true) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  next();
}
