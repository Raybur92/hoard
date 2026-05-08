jest.mock('@hoard/db', () => ({
  prisma: {
    platformLog: { create: jest.fn() },
  },
}));

import { logPlatform } from './platformLog';
import { prisma } from '@hoard/db';

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('logPlatform', () => {
  it('writes a row with the provided fields', async () => {
    (prisma.platformLog.create as jest.Mock).mockResolvedValue({});

    await logPlatform('plat-1', 'user-1', 'info', 'sync.ok', 'sync ok in 10.2s', { durationMs: 10234 });

    expect(prisma.platformLog.create).toHaveBeenCalledWith({
      data: {
        platformId: 'plat-1',
        userId: 'user-1',
        level: 'info',
        event: 'sync.ok',
        message: 'sync ok in 10.2s',
        details: { durationMs: 10234 },
      },
    });
  });

  it('omits the details field when caller passes nothing (Prisma falls back to NULL default)', async () => {
    (prisma.platformLog.create as jest.Mock).mockResolvedValue({});

    await logPlatform('plat-1', 'user-1', 'info', 'sync.started', 'sync started');

    const call = (prisma.platformLog.create as jest.Mock).mock.calls[0][0];
    expect(call.data).not.toHaveProperty('details');
  });

  it('swallows errors so the calling sync flow never fails on a logging issue', async () => {
    (prisma.platformLog.create as jest.Mock).mockRejectedValue(new Error('db down'));

    await expect(
      logPlatform('plat-1', 'user-1', 'error', 'sync.error', 'something broke'),
    ).resolves.toBeUndefined();

    expect(console.error).toHaveBeenCalled();
  });
});
