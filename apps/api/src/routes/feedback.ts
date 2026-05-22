// F1.2 of the feedback-channel workstream (docs/FEEDBACK_PLAN.md). POST
// /api/feedback persists user-submitted feedback for review in /admin
// (the admin GET/PATCH endpoints live in routes/admin.ts alongside the
// invite-code admin surface). L2 layer of the user-research observation
// system (docs/USER_RESEARCH.md §6.2) — in-app feedback form, no push
// channel in v1 per F-D6.
//
// Rate-limiting per F-D9: two-tier per-user limiter (10/h + 20/d). Both
// windows keyed on req.userId so a malicious user logging out and back
// in mints a fresh token without resetting their budget. Production-only
// via the existing skipInDev pattern.
//
// requireActive runs BEFORE the limiters so pending users get 403
// PENDING_INVITE before their budget burns. The limiter only meters
// active users who are entitled to the endpoint.

import { Router } from 'express';
import type { Request, Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '@hoard/db';
import { requireUser } from '../middleware/user';
import { requireActive } from '../middleware/active';

const router = Router();

const skipInDev = (): boolean => process.env['NODE_ENV'] !== 'production';

// IP fallback uses ipKeyGenerator() per express-rate-limit v8+ to collapse
// IPv6 addresses to a /64 prefix subnet (prevents trivial bypass via IPv6
// address rotation within an allocation). Userid path is unchanged —
// it's an opaque id, not an address.
const feedbackHourlyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.userId ?? (req.ip ? ipKeyGenerator(req.ip) : 'unknown'),
  skip: skipInDev,
  message: { error: 'RATE_LIMITED' },
});

const feedbackDailyLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.userId ?? (req.ip ? ipKeyGenerator(req.ip) : 'unknown'),
  skip: skipInDev,
  message: { error: 'RATE_LIMITED' },
});

const postFeedbackSchema = z.object({
  message: z.string().min(1).max(16000),
  viewport: z.string().max(64).optional(),
  ua: z.string().max(512).optional(),
});

// POST /api/feedback
//
// Accepts a feedback note from any active user. Auto-captures the
// client-supplied viewport + UA; UA falls back to req.headers['user-agent']
// when the client omits it. Returns 201 + { id } so the client can show a
// "thanks — your note is logged" toast without rendering the row.
router.post(
  '/feedback',
  requireUser,
  requireActive,
  feedbackHourlyLimiter,
  feedbackDailyLimiter,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = postFeedbackSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
      return;
    }

    const { message, viewport } = parsed.data;
    const ua = parsed.data.ua ?? req.headers['user-agent'] ?? null;

    const created = await prisma.feedback.create({
      data: {
        userId: req.userId,
        message,
        viewport: viewport ?? null,
        ua,
      },
      select: { id: true },
    });

    res.status(201).json({ id: created.id });
  },
);

export default router;
