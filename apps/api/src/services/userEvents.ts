// TL1.2 of the telemetry workstream (docs/TELEMETRY_PLAN.md). The
// `logEvent()` helper writes one row to `UserEvent` per touchpoint. L1
// layer of the user-research observation system (docs/USER_RESEARCH.md
// §6.2). The 8 v1 touchpoints + their payloads are listed in §3.4 of
// the plan.
//
// Fire-and-forget semantics per TL-D2: this function wraps its body in
// try/catch and never re-throws. A logging failure must never break the
// user-visible action that triggered it. Mirrors `platformLog.ts`.
//
// Call-site discipline per TL-D5: every caller must pass a plain object
// literal as `details` OR omit the argument entirely. No JSON.stringify
// strings, no explicit `null`, no arrays. The mapper at
// `apps/api/src/lib/mappers.ts` normalises any non-object JSON to `null`
// at the API boundary — that's a safety net, not a license to drift.

import { Prisma } from '@prisma/client';
import { prisma } from '@hoard/db';

// session.opened throttle window. Daily granularity per TL-D3 — the
// signal we want from session.opened is G4 retention (D1/D7/D30 cohort
// curves), not intraday engagement. Daily writes are 1/24th the rows
// of hourly with no loss for the retention use case. Revisit window
// only if we ever start asking intraday questions.
const SESSION_THROTTLE_MS = 24 * 60 * 60 * 1000;

export async function logEvent(
  userId: string,
  event: string,
  details?: Record<string, unknown>,
): Promise<void> {
  try {
    // session.opened throttle: skip the write if a recent row exists
    // for this user. Other event types always write.
    //
    // Perf note: this findFirst is a DB round-trip on every authed
    // request that hits the session.opened call site. Deliberate at
    // cohort size (~6 users → ~hundreds of requests/day → ~hundreds
    // of round-trips). The standard optimization when this matters is
    // an in-memory LRU keyed on userId with the same 24h TTL — defer
    // until profile data says it's worth it.
    if (event === 'session.opened') {
      const recent = await prisma.userEvent.findFirst({
        where: {
          userId,
          event: 'session.opened',
          createdAt: { gte: new Date(Date.now() - SESSION_THROTTLE_MS) },
        },
        select: { id: true },
      });
      if (recent) return;
    }

    await prisma.userEvent.create({
      data: {
        userId,
        event,
        ...(details !== undefined ? { details: details as Prisma.InputJsonValue } : {}),
      },
    });
  } catch (err) {
    // TL-D2: telemetry must never break the user-visible path.
    // Log and swallow — but downgrade the noisy "user doesn't exist"
    // FK-violation case (P2003) to a one-line warn, since the cause
    // is well-understood (stale JWT cookie referencing a deleted user)
    // and the Prisma error object is verbose.
    //
    // requireUser fires session.opened on cookie verify SUCCESS, before
    // the route hits any DB code that would notice the user is gone.
    // The 404 the route eventually returns is the right response shape;
    // the telemetry write just happens to fail first, and that's fine.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      console.warn(`[userEvents] skipped ${event} for user ${userId}: user no longer exists`);
      return;
    }
    console.error('[userEvents] logEvent failed:', err);
  }
}
