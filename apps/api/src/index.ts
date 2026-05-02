import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import authRouter from './routes/auth';
import dashboardRouter from './routes/dashboard';
import gamesRouter from './routes/games';
import upcomingRouter from './routes/upcoming';
import statsRouter from './routes/stats';
import platformsRouter from './routes/platforms';
import igdbRouter from './routes/igdb';

const app = express();
const PORT = process.env['PORT'] ?? 3001;

app.use(helmet());
app.use(cors({ origin: process.env['WEB_URL'] ?? 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

app.use('/api', authRouter);
app.use('/api', dashboardRouter);
app.use('/api', gamesRouter);
app.use('/api', upcomingRouter);
app.use('/api', statsRouter);
app.use('/api', platformsRouter);
app.use('/api', igdbRouter);

// Global error handler — catches unhandled async throws in route handlers
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[api] unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[api] listening on port ${PORT}`);
  });
}

export { app };
