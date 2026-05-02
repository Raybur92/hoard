import { Request, Response, NextFunction } from 'express';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId: string;
    }
  }
}

// Phase 3 stub — Phase 4 replaces this with JWT cookie verification.
// In dev, use the seeded user ID. In production (no auth yet), return 401.
export function requireUser(req: Request, res: Response, next: NextFunction): void {
  const devUserId = process.env['DEV_USER_ID'] ?? 'seed-andrea';

  if (process.env['NODE_ENV'] === 'production') {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  req.userId = devUserId;
  next();
}
