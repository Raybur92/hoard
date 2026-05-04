import { Router } from 'express';
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '@hoard/db';
import { requireUser } from '../middleware/user';
import type { AuthResponse, AuthUser } from '@hoard/types';

type DbUser = {
  id: string; email: string; name: string | null; createdAt: Date;
  hypeThreshold: number; libraryView: string; showHltb: boolean;
  coverDensity: string; terminalCursor: boolean;
};

function toAuthUser(u: DbUser): AuthUser {
  return {
    id: u.id, email: u.email, name: u.name, createdAt: u.createdAt.toISOString(),
    preferences: {
      hypeThreshold: u.hypeThreshold,
      libraryView: u.libraryView as AuthUser['preferences']['libraryView'],
      showHltb: u.showHltb,
      coverDensity: u.coverDensity as AuthUser['preferences']['coverDensity'],
      terminalCursor: u.terminalCursor,
    },
  };
}

const USER_SELECT = {
  id: true, email: true, name: true, createdAt: true,
  hypeThreshold: true, libraryView: true, showHltb: true,
  coverDensity: true, terminalCursor: true,
} as const;

const router = Router();

const JWT_SECRET = process.env['JWT_SECRET'] ?? 'dev-secret';
const JWT_EXPIRES_IN = process.env['JWT_EXPIRES_IN'] ?? '7d';
const WEB_URL = process.env['WEB_URL'] ?? 'http://localhost:5173';
const API_URL = process.env['API_URL'] ?? 'http://localhost:3001';

function getSessionUserId(req: Request): string | null {
  const token = req.cookies['session'] as string | undefined;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
    return payload.sub;
  } catch {
    return null;
  }
}

function cookieOptions() {
  const isProd = process.env['NODE_ENV'] === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
  };
}

function setAuthCookie(res: Response, userId: string): void {
  const token = jwt.sign({ sub: userId }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  } as jwt.SignOptions);
  res.cookie('session', token, {
    ...cookieOptions(),
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /api/auth/register
router.post('/auth/register', async (req: Request, res: Response): Promise<void> => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }
  const { email, password, name } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: 'Email already registered' });
    return;
  }

  const hashed = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, password: hashed, ...(name ? { name } : {}) },
    select: { ...USER_SELECT, password: false },
  });

  setAuthCookie(res, user.id);
  const body: AuthResponse = { user: toAuthUser(user) };
  res.status(201).json(body);
});

// POST /api/auth/login
router.post('/auth/login', async (req: Request, res: Response): Promise<void> => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid email or password format' });
    return;
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.password) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  setAuthCookie(res, user.id);
  const body: AuthResponse = { user: toAuthUser(user) };
  res.json(body);
});

// POST /api/auth/logout
router.post('/auth/logout', (_req: Request, res: Response): void => {
  res.clearCookie('session', cookieOptions());
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/auth/me', requireUser, async (req: Request, res: Response): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: USER_SELECT,
  });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const body: AuthResponse = { user: toAuthUser(user) };
  res.set('Cache-Control', 'private, max-age=10');
  res.json(body);
});

// PATCH /api/auth/me — update profile and/or preferences
router.patch('/auth/me', requireUser, async (req: Request, res: Response): Promise<void> => {
  const schema = z.object({
    name: z.string().min(1).max(80).optional(),
    email: z.string().email().optional(),
    hypeThreshold: z.coerce.number().int().min(0).max(100).optional(),
    libraryView: z.enum(['shelves', 'grid', 'list']).optional(),
    showHltb: z.boolean().optional(),
    coverDensity: z.enum(['cozy', 'standard', 'dense']).optional(),
    terminalCursor: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }
  const { name, email, ...prefs } = parsed.data;
  if (email) {
    const conflict = await prisma.user.findUnique({ where: { email } });
    if (conflict && conflict.id !== req.userId) {
      res.status(409).json({ error: 'Email already in use' });
      return;
    }
  }
  const data: Record<string, unknown> = {};
  if (name !== undefined) data['name'] = name;
  if (email !== undefined) data['email'] = email;
  Object.assign(data, prefs);
  const user = await prisma.user.update({ where: { id: req.userId }, data, select: USER_SELECT });
  const body: AuthResponse = { user: toAuthUser(user) };
  res.json(body);
});

// DELETE /api/auth/me — permanently delete account and all data
router.delete('/auth/me', requireUser, async (req: Request, res: Response): Promise<void> => {
  await prisma.user.delete({ where: { id: req.userId } });
  res.clearCookie('session', cookieOptions());
  res.json({ ok: true });
});

/* ── Google OAuth ── */

const GOOGLE_CLIENT_ID = process.env['GOOGLE_CLIENT_ID'] ?? '';
const GOOGLE_CLIENT_SECRET = process.env['GOOGLE_CLIENT_SECRET'] ?? '';
const GOOGLE_REDIRECT_URI = process.env['GOOGLE_REDIRECT_URI'] ?? `${API_URL}/api/auth/google/callback`;

// GET /api/auth/google
router.get('/auth/google', (_req: Request, res: Response): void => {
  if (!GOOGLE_CLIENT_ID) {
    res.status(501).json({ error: 'Google OAuth not configured' });
    return;
  }
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

// GET /api/auth/google/callback
router.get('/auth/google/callback', async (req: Request, res: Response): Promise<void> => {
  const code = typeof req.query['code'] === 'string' ? req.query['code'] : null;
  if (!code) {
    res.redirect(`${WEB_URL}/login?error=google_failed`);
    return;
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }).toString(),
    });
    if (!tokenRes.ok) throw new Error('Token exchange failed');
    const tokenData = await tokenRes.json() as { access_token: string };

    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!userInfoRes.ok) throw new Error('User info fetch failed');
    const googleUser = await userInfoRes.json() as { id: string; email: string; name: string };

    // Connect mode: associate Google account with the currently logged-in user
    const currentUserId = getSessionUserId(req);
    if (currentUserId) {
      await prisma.user.update({
        where: { id: currentUserId },
        data: { googleId: googleUser.id },
      });
      res.redirect(`${WEB_URL}/settings`);
      return;
    }

    // Login mode: find or create a user by Google ID
    let user = await prisma.user.findUnique({ where: { googleId: googleUser.id } });
    if (!user) {
      user = await prisma.user.findUnique({ where: { email: googleUser.email } });
      if (user) {
        await prisma.user.update({ where: { id: user.id }, data: { googleId: googleUser.id } });
      } else {
        user = await prisma.user.create({
          data: { email: googleUser.email, name: googleUser.name, googleId: googleUser.id },
        });
      }
    }

    setAuthCookie(res, user.id);
    res.redirect(WEB_URL);
  } catch (err) {
    console.error('[auth] Google OAuth error:', err);
    res.redirect(`${WEB_URL}/login?error=google_failed`);
  }
});

/* ── Steam OpenID ── */

const STEAM_API_KEY = process.env['STEAM_API_KEY'] ?? '';

// GET /api/auth/steam
router.get('/auth/steam', (_req: Request, res: Response): void => {
  const returnTo = `${API_URL}/api/auth/steam/callback`;
  const realm = API_URL;
  const params = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo,
    'openid.realm': realm,
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
  });
  res.redirect(`https://steamcommunity.com/openid/login?${params.toString()}`);
});

// GET /api/auth/steam/callback
router.get('/auth/steam/callback', async (req: Request, res: Response): Promise<void> => {
  const params = req.query as Record<string, string>;

  if (params['openid.mode'] !== 'id_res') {
    res.redirect(`${WEB_URL}/login?error=steam_failed`);
    return;
  }

  try {
    // Verify the assertion with Steam
    const verifyParams = new URLSearchParams({ ...params, 'openid.mode': 'check_authentication' });
    const verifyRes = await fetch('https://steamcommunity.com/openid/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: verifyParams.toString(),
    });
    const verifyText = await verifyRes.text();
    if (!verifyText.includes('is_valid:true')) {
      res.redirect(`${WEB_URL}/login?error=steam_failed`);
      return;
    }

    // Extract Steam64 ID from the claimed_id URL
    const claimedId = params['openid.claimed_id'] ?? '';
    const match = claimedId.match(/\/id\/(\d+)$/);
    if (!match) {
      res.redirect(`${WEB_URL}/login?error=steam_failed`);
      return;
    }
    const steamId = match[1] as string;

    // Fetch Steam display name if API key is available (used in both modes)
    let displayName = `Steam:${steamId}`;
    if (STEAM_API_KEY) {
      try {
        const profileRes = await fetch(
          `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_API_KEY}&steamids=${steamId}`
        );
        const pd = await profileRes.json() as { response: { players: { personaname: string }[] } };
        displayName = pd.response.players[0]?.personaname ?? displayName;
      } catch { /* ignore — use fallback name */ }
    }

    // Connect mode: associate Steam account with the currently logged-in user
    const currentUserId = getSessionUserId(req);
    if (currentUserId) {
      // Remove any orphan Steam-login account that was auto-created for this
      // steamId (email pattern steam:*@hoard.internal) so the unique constraint
      // doesn't block associating the same steamId with the real user.
      await prisma.user.deleteMany({
        where: { steamId, email: `steam:${steamId}@hoard.internal`, NOT: { id: currentUserId } },
      });
      await prisma.user.update({
        where: { id: currentUserId },
        data: { steamId },
      });
      await prisma.platform.upsert({
        where: { userId_code: { userId: currentUserId, code: 'ST' } },
        update: { credentials: { steamId }, syncStatus: 'ok', lastSyncAt: new Date() },
        create: {
          userId: currentUserId,
          code: 'ST',
          syncable: true,
          credentials: { steamId },
          syncStatus: 'ok',
          lastSyncAt: new Date(),
        },
      });
      res.redirect(`${WEB_URL}/settings/platforms/st`);
      return;
    }

    // Login mode: find or create a user by Steam ID
    let user = await prisma.user.findUnique({ where: { steamId } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: `steam:${steamId}@hoard.internal`,
          name: displayName,
          steamId,
        },
      });
    }

    setAuthCookie(res, user.id);
    res.redirect(WEB_URL);
  } catch (err) {
    console.error('[auth] Steam OpenID error:', err);
    res.redirect(`${WEB_URL}/login?error=steam_failed`);
  }
});

export default router;
