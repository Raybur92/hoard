import { displayIdentity } from './displayIdentity';

describe('displayIdentity', () => {
  it('returns the email for a regular email/password account', () => {
    expect(displayIdentity({ email: 'andrea@example.com', steamId: null })).toBe('andrea@example.com');
  });

  it('returns the email for a Google-linked account (real email, steamId set or not)', () => {
    expect(displayIdentity({ email: 'someone@gmail.com', steamId: null })).toBe('someone@gmail.com');
    // A user who logged in with Google AND linked Steam later still has
    // a real email — not synthetic — so we surface the email.
    expect(displayIdentity({ email: 'someone@gmail.com', steamId: '76561198012345678' })).toBe('someone@gmail.com');
  });

  it('returns "Steam user — {steamId}" for a synthetic-Steam account', () => {
    expect(displayIdentity({
      email: 'steam:76561198012345678@hoard.internal',
      steamId: '76561198012345678',
    })).toBe('Steam user — 76561198012345678');
  });

  it('does NOT misclassify a real email that happens to contain "steam:" or "@hoard.internal"', () => {
    // Edge case — someone could have a weird email. The check is
    // both prefix AND suffix AND non-null steamId.
    expect(displayIdentity({ email: 'steam:fake@gmail.com', steamId: '76561198012345678' })).toBe('steam:fake@gmail.com');
    expect(displayIdentity({ email: 'fake@hoard.internal', steamId: '76561198012345678' })).toBe('fake@hoard.internal');
  });

  it('returns the email when steamId is null even if the email matches the synthetic pattern', () => {
    // Defensive — synthetic accounts always have steamId set; this
    // shape shouldn't exist in production, but if it does, falling
    // back to the email is the right call.
    expect(displayIdentity({ email: 'steam:76561198012345678@hoard.internal', steamId: null }))
      .toBe('steam:76561198012345678@hoard.internal');
  });
});
