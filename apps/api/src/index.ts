import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import { prisma } from '@hoard/db';

import authRouter from './routes/auth';
import dashboardRouter from './routes/dashboard';
import gamesRouter from './routes/games';
import upcomingRouter from './routes/upcoming';
import releasesRouter from './routes/releases';
import statsRouter from './routes/stats';
import platformsRouter from './routes/platforms';
import igdbRouter from './routes/igdb';
import adminRouter from './routes/admin';

const app = express();
const PORT = process.env['PORT'] ?? 3001;
const startTime = Date.now();

// Trust the platform proxy (Railway / Vercel) so req.ip and X-Forwarded-For
// resolve to the real client IP — required by express-rate-limit.
app.set('trust proxy', 1);

// ── Logging ───────────────────────────────────────────────────────────
app.use(pinoHttp({
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  autoLogging: { ignore: (req) => req.url === '/health' },
}));

// ── Security ──────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS ──────────────────────────────────────────────────────────────
const WEB_URL = process.env['WEB_URL'] ?? 'http://localhost:5173';
const DEV_URL = 'http://localhost:5173';

function corsOrigin(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
): void {
  if (!origin) { callback(null, true); return; } // server-to-server / health probes
  if (origin === WEB_URL || origin === DEV_URL) { callback(null, true); return; }
  // Production domain (apex + any subdomain on the same parent)
  if (/^https:\/\/(?:[a-z0-9-]+\.)?gamehoardr\.com$/.test(origin)) { callback(null, true); return; }
  // Vercel preview deployments (pattern: hoard*.vercel.app)
  if (/^https:\/\/hoard[a-z0-9-]*\.vercel\.app$/.test(origin)) { callback(null, true); return; }
  callback(null, false);
}

app.use(cors({ origin: corsOrigin, credentials: true }));

// ── Body / cookie parsing ─────────────────────────────────────────────
app.use(express.json());
app.use(cookieParser());

// ── Rate limiting ─────────────────────────────────────────────────────
// Skipped entirely outside production: Playwright runs 5 workers in parallel
// and burned through the 100/min/IP budget mid-suite, causing later tests to
// 429 on /api/auth/me — which the frontend reads as auth failure → redirect
// to /login → snapshot captures login screen instead of the actual route.
// Rate limiting still matters in production where the load is real users.
const skipInDev = (): boolean => process.env['NODE_ENV'] !== 'production';

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInDev,
  message: { error: 'Too many requests — please try again in a moment' },
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInDev,
  message: { error: 'Too many authentication attempts — please wait before trying again' },
});

app.use(globalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// ── Health check ──────────────────────────────────────────────────────
app.get('/health', async (_req: Request, res: Response): Promise<void> => {
  let dbStatus: 'ok' | 'error' = 'ok';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = 'error';
  }
  res.json({
    status: 'ok',
    db: dbStatus,
    uptime: Math.floor((Date.now() - startTime) / 1000),
  });
});

// ── API routes ────────────────────────────────────────────────────────
app.use('/api', authRouter);
app.use('/api', dashboardRouter);
app.use('/api', gamesRouter);
app.use('/api', upcomingRouter);
app.use('/api', releasesRouter);
app.use('/api', statsRouter);
app.use('/api', platformsRouter);
app.use('/api', igdbRouter);
app.use('/api', adminRouter);

// ── Global error handler ──────────────────────────────────────────────
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  (req as Request & { log?: { error: (msg: string, err: unknown) => void } }).log?.error(
    'unhandled error',
    err,
  );
  res.status(500).json({ error: 'Internal server error' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[api] listening on port ${PORT}`);
  });
}

export { app };
