import { mapFeedback, mapFeedbackWithUser, mapUserEvent, mapUserEventWithUser } from './mappers';

describe('mapFeedback', () => {
  it('converts a Prisma Feedback row into the API-facing shape', () => {
    const createdAt = new Date('2026-05-13T12:00:00.000Z');

    const result = mapFeedback({
      id: 'fb_1',
      userId: 'usr_1',
      message: 'hero countdown is frozen',
      viewport: '1440×900',
      ua: 'Mozilla/5.0',
      read: false,
      createdAt,
    });

    expect(result).toEqual({
      id: 'fb_1',
      userId: 'usr_1',
      message: 'hero countdown is frozen',
      viewport: '1440×900',
      ua: 'Mozilla/5.0',
      read: false,
      createdAt: '2026-05-13T12:00:00.000Z',
    });
  });

  it('preserves null viewport/ua', () => {
    const result = mapFeedback({
      id: 'fb_2',
      userId: 'usr_2',
      message: 'something',
      viewport: null,
      ua: null,
      read: true,
      createdAt: new Date('2026-05-13T12:00:00.000Z'),
    });

    expect(result.viewport).toBeNull();
    expect(result.ua).toBeNull();
    expect(result.read).toBe(true);
  });
});

describe('mapFeedbackWithUser', () => {
  it('joins user identity via displayIdentity (email path)', () => {
    const result = mapFeedbackWithUser({
      id: 'fb_1',
      userId: 'usr_1',
      message: 'note',
      viewport: '414×896',
      ua: 'Mobile',
      read: false,
      createdAt: new Date('2026-05-13T12:00:00.000Z'),
      user: {
        id: 'usr_1',
        email: 'gaetano@example.com',
        name: 'Gaetano',
        steamId: null,
      },
    });

    // displayIdentity precedence: real email beats name (the name field is
    // a display preference; the email is the ground-truth identifier).
    expect(result.user).toEqual({
      id: 'usr_1',
      email: 'gaetano@example.com',
      name: 'Gaetano',
      displayIdentity: 'gaetano@example.com',
    });
    expect(result.message).toBe('note');
  });

  it('falls back to name for synthetic-Steam accounts', () => {
    const result = mapFeedbackWithUser({
      id: 'fb_2',
      userId: 'usr_2',
      message: 'note',
      viewport: null,
      ua: null,
      read: false,
      createdAt: new Date('2026-05-13T12:00:00.000Z'),
      user: {
        id: 'usr_2',
        email: 'steam:76561198012345678@hoard.internal',
        name: 'Bedkarma',
        steamId: '76561198012345678',
      },
    });

    expect(result.user.displayIdentity).toBe('Bedkarma');
  });
});

describe('mapUserEvent', () => {
  it('converts a Prisma UserEvent row into the API-facing shape', () => {
    const result = mapUserEvent({
      id: 'evt_1',
      userId: 'usr_1',
      event: 'wishlist.toggled',
      details: { igdbId: 12345, action: 'add' },
      createdAt: new Date('2026-05-21T12:00:00.000Z'),
    });

    expect(result).toEqual({
      id: 'evt_1',
      userId: 'usr_1',
      event: 'wishlist.toggled',
      details: { igdbId: 12345, action: 'add' },
      createdAt: '2026-05-21T12:00:00.000Z',
    });
  });

  it('normalises null / non-object JSON details to null', () => {
    // Prisma JsonValue can be primitives or arrays in theory; our write
    // paths only produce object payloads, so anything else maps to null
    // at the API boundary to keep the API-facing type clean.
    expect(mapUserEvent({
      id: 'evt_2', userId: 'u', event: 'session.opened',
      details: null, createdAt: new Date('2026-05-21T12:00:00.000Z'),
    }).details).toBeNull();

    expect(mapUserEvent({
      id: 'evt_3', userId: 'u', event: 'session.opened',
      details: 'unexpected-string', createdAt: new Date('2026-05-21T12:00:00.000Z'),
    }).details).toBeNull();

    expect(mapUserEvent({
      id: 'evt_4', userId: 'u', event: 'session.opened',
      details: [1, 2, 3], createdAt: new Date('2026-05-21T12:00:00.000Z'),
    }).details).toBeNull();
  });
});

describe('mapUserEventWithUser', () => {
  it('joins user identity via displayIdentity (email path)', () => {
    const result = mapUserEventWithUser({
      id: 'evt_1',
      userId: 'usr_1',
      event: 'sync.first',
      details: { code: 'PS', gamesImported: 488 },
      createdAt: new Date('2026-05-21T12:00:00.000Z'),
      user: {
        id: 'usr_1',
        email: 'luigi@example.com',
        name: 'Luigi',
        steamId: null,
      },
    });

    expect(result.user).toEqual({
      id: 'usr_1',
      email: 'luigi@example.com',
      name: 'Luigi',
      displayIdentity: 'luigi@example.com',
    });
    expect(result.event).toBe('sync.first');
    expect(result.details).toEqual({ code: 'PS', gamesImported: 488 });
  });
});
