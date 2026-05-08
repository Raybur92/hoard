import { displayIdentity } from './displayIdentity';

describe('displayIdentity', () => {
  it('returns the email for a regular email/password account', () => {
    expect(displayIdentity({ email: 'andrea@example.com', name: null, steamId: null })).toBe('andrea@example.com');
  });

  it('returns the email for a regular account regardless of whether a name is set', () => {
    // Real-email users always surface the email — the name is just a
    // display preference; the email is the ground-truth identifier.
    expect(displayIdentity({ email: 'andrea@example.com', name: 'Andrea', steamId: null })).toBe('andrea@example.com');
  });

  it('returns the email for a Google-linked account that later linked Steam', () => {
    // Real email + steamId set is NOT synthetic; surface the email.
    expect(displayIdentity({ email: 'someone@gmail.com', name: 'Someone', steamId: '76561198012345678' }))
      .toBe('someone@gmail.com');
  });

  it('returns the name for a synthetic-Steam account when name is set (preferred over Steam-id fallback)', () => {
    // Steam OAuth populates User.name from GetPlayerSummaries by default.
    // The handle is what Andrea recognizes; the Steam64 id isn't.
    expect(displayIdentity({
      email: 'steam:76561198012345678@hoard.internal',
      name: 'Bedkarma',
      steamId: '76561198012345678',
    })).toBe('Bedkarma');
  });

  it('returns "Steam user — {steamId}" for a synthetic-Steam account when name is null (private profile / API failure)', () => {
    // Fallback path — GetPlayerSummaries can fail or the profile can
    // be private, leaving User.name null. The Steam id is then the
    // only identifier we have.
    expect(displayIdentity({
      email: 'steam:76561198012345678@hoard.internal',
      name: null,
      steamId: '76561198012345678',
    })).toBe('Steam user — 76561198012345678');
  });

  it('falls back to "Steam user — {steamId}" when name is empty string (defensive)', () => {
    expect(displayIdentity({
      email: 'steam:76561198012345678@hoard.internal',
      name: '',
      steamId: '76561198012345678',
    })).toBe('Steam user — 76561198012345678');
  });

  it('does NOT misclassify a real email that happens to contain "steam:" or "@hoard.internal"', () => {
    // Edge case — someone could have a weird email. The synthetic
    // check is prefix AND suffix AND non-null steamId.
    expect(displayIdentity({ email: 'steam:fake@gmail.com', name: 'Fake', steamId: '76561198012345678' }))
      .toBe('steam:fake@gmail.com');
    expect(displayIdentity({ email: 'fake@hoard.internal', name: 'Fake', steamId: '76561198012345678' }))
      .toBe('fake@hoard.internal');
  });

  it('returns the email when steamId is null even if the email matches the synthetic pattern (defensive)', () => {
    // Defensive — synthetic accounts always have steamId set; this
    // shape shouldn't exist in production, but if it does, falling
    // back to the email is the right call (email is still ground truth).
    expect(displayIdentity({
      email: 'steam:76561198012345678@hoard.internal',
      name: null,
      steamId: null,
    })).toBe('steam:76561198012345678@hoard.internal');
  });
});
