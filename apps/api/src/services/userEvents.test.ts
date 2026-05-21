// TL1.2 tests for the telemetry helper. Helper unit tests mock Prisma
// directly; sampled touchpoint integration tests mock the helper itself
// to spy on call sites without re-exercising the helper's internals
// (per Andrea's "testing all 8 is testing the helper twice" rule).

jest.mock('@hoard/db', () => ({
  prisma: {
    userEvent: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
  },
}));

import { logEvent } from './userEvents';
import { prisma } from '@hoard/db';

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('logEvent — helper unit tests', () => {
  it('writes a row with userId / event / details when called with a payload', async () => {
    (prisma.userEvent.create as jest.Mock).mockResolvedValue({});

    await logEvent('user-1', 'wishlist.toggled', { igdbId: 12345, action: 'add' });

    expect(prisma.userEvent.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        event: 'wishlist.toggled',
        details: { igdbId: 12345, action: 'add' },
      },
    });
  });

  it('omits the details key when caller passes nothing — Prisma falls back to NULL', async () => {
    (prisma.userEvent.create as jest.Mock).mockResolvedValue({});

    await logEvent('user-1', 'signup.pending');

    const call = (prisma.userEvent.create as jest.Mock).mock.calls[0][0];
    expect(call.data).not.toHaveProperty('details');
    expect(call.data).toEqual({ userId: 'user-1', event: 'signup.pending' });
  });

  it('skips the write when a recent session.opened row already exists for this user', async () => {
    (prisma.userEvent.findFirst as jest.Mock).mockResolvedValue({ id: 'evt_recent' });

    await logEvent('user-1', 'session.opened', { userAgent: 'TestBrowser/1.0' });

    expect(prisma.userEvent.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        event: 'session.opened',
        createdAt: { gte: expect.any(Date) },
      },
      select: { id: true },
    });
    expect(prisma.userEvent.create).not.toHaveBeenCalled();
  });

  it('writes session.opened when no recent row exists for this user', async () => {
    (prisma.userEvent.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.userEvent.create as jest.Mock).mockResolvedValue({});

    await logEvent('user-1', 'session.opened', { userAgent: 'TestBrowser/1.0' });

    expect(prisma.userEvent.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        event: 'session.opened',
        details: { userAgent: 'TestBrowser/1.0' },
      },
    });
  });

  it('does NOT run the throttle check for non-session events', async () => {
    (prisma.userEvent.create as jest.Mock).mockResolvedValue({});

    await logEvent('user-1', 'platform.connected', { code: 'PS' });

    expect(prisma.userEvent.findFirst).not.toHaveBeenCalled();
    expect(prisma.userEvent.create).toHaveBeenCalled();
  });

  it('swallows DB errors so the calling code path never fails on a logging issue', async () => {
    (prisma.userEvent.create as jest.Mock).mockRejectedValue(new Error('db down'));

    await expect(
      logEvent('user-1', 'remap.used', { fromIgdbId: 1, toIgdbId: 2, merged: false }),
    ).resolves.toBeUndefined();

    expect(console.error).toHaveBeenCalled();
  });
});
