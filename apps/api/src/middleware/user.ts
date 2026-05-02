import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId: string;
    }
  }
}

const JWT_SECRET = process.env['JWT_SECRET'] ?? 'dev-secret';
const DEV_USER_ID = process.env['DEV_USER_ID'] ?? 'seed-andrea';

export function requireUser(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies['session'] as string | undefined;

  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
      req.userId = payload.sub;
      next();
      return;
    } catch {
      res.status(401).json({ error: 'Invalid or expired session' });
      return;
    }
  }

  // Dev fallback: in any non-production environment, allow cookie-less requests
  // through using the seeded dev user ID so you can test routes without logging in.
  if (process.env['NODE_ENV'] !== 'production') {
    req.userId = DEV_USER_ID;
    next();
    return;
  }

  res.status(401).json({ error: 'Unauthenticated' });
}

// Alias used by auth routes
export { requireUser as requireAuth };
