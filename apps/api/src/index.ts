import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import dashboardRouter from './routes/dashboard';
import gamesRouter from './routes/games';
import upcomingRouter from './routes/upcoming';
import statsRouter from './routes/stats';

const app = express();
const PORT = process.env['PORT'] ?? 3001;

app.use(helmet());
app.use(cors({ origin: process.env['WEB_URL'] ?? 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

app.use('/api', dashboardRouter);
app.use('/api', gamesRouter);
app.use('/api', upcomingRouter);
app.use('/api', statsRouter);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[api] listening on port ${PORT}`);
  });
}

export { app };
