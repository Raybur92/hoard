import express from 'express';
import type { Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { requireUser as RequireUser } from './user';

// JWT_SECRET defaults to 'dev-secret' when the env var is absent, which is
// the case in the test environment. All token signing uses that same value.
const DEV_SECRET = 'dev-secret';
const DEV_USER_ID = 'seed-andrea';

function makeApp() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { requireUser } = require('./user') as { requireUser: typeof RequireUser };
  const app = express();
  app.use(cookieParser());
  app.get('/protected', requireUser, (req: Request, res: Response) => {
    res.json({ userId: req.userId });
  });
  return app;
}

describe('requireUser middleware', () => {
  let app: ReturnType<typeof makeApp>;

  beforeEach(() => {
    jest.resetModules();
    app = makeApp();
  });

  it('passes through and sets userId for a valid session cookie', async () => {
    const token = jwt.sign({ sub: 'user-abc' }, DEV_SECRET, { expiresIn: '1h' });
    const res = await request(app).get('/protected').set('Cookie', `session=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe('user-abc');
  });

  it('returns 401 when the cookie holds a malformed token', async () => {
    const res = await request(app).get('/protected').set('Cookie', 'session=not.a.valid.jwt');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid|expired/i);
  });

  it('returns 401 when the cookie holds an expired token', async () => {
    const expired = jwt.sign({ sub: 'user-abc' }, DEV_SECRET, { expiresIn: '-1s' });
    const res = await request(app).get('/protected').set('Cookie', `session=${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid|expired/i);
  });

  it('uses the dev fallback user when no cookie is present and NODE_ENV is not production', async () => {
    // Jest sets NODE_ENV to 'test', which is not 'production', so the fallback applies
    // regardless of JWT_SECRET value.
    const res = await request(app).get('/protected');
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(DEV_USER_ID);
  });
});
