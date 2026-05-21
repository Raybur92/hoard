import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logEvent } from '../services/userEvents';

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

// Fire-and-forget session.opened write — voided rather than awaited so
// the middleware doesn't add a DB round-trip to every authed response.
// The helper's own throttle (TL-D3, daily) keeps row count sane; the
// helper's own try/catch (TL-D2) swallows runtime errors.
//
// **Invariant — must be called AFTER JWT verify (or after the dev-fallback
// userId assignment).** The inner try/catch here only swallows logEvent
// failures, NOT auth errors. JWT verify runs upstream in `requireUser`
// before this is called; an auth failure raised there is caught by the
// outer requireUser try/catch and returns 401. Reordering so that this
// runs before verify would silently eat auth errors and let the request
// continue with `req.userId` undefined.
//
// Defensive outer try/catch is belt-and-suspenders: the requireUser
// catch block below is bare and would intercept any sync throw here
// (including a hypothetical "logEvent is undefined" import-time
// breakage), turning a logging issue into a spurious 401. TL-D2 says
// telemetry must never break the user-visible path — auth is the
// user-visible path. So we eat any error here too.
function fireSessionEvent(req: Request): void {
  try {
    const ua = req.headers['user-agent'];
    void logEvent(req.userId, 'session.opened', ua ? { userAgent: ua } : undefined);
  } catch (err) {
    console.error('[requireUser] session.opened fire failed:', err);
  }
}

export function requireUser(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies['session'] as string | undefined;

  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
      req.userId = payload.sub;
      fireSessionEvent(req);
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
    fireSessionEvent(req);
    next();
    return;
  }

  res.status(401).json({ error: 'Unauthenticated' });
}

// Alias used by auth routes
export { requireUser as requireAuth };
