// EV-PR1 backend tests for getEventState (pure-function, no Prisma/IGDB).
// Service-level sync orchestrator tests live in events.route.test.ts where
// they exercise the integration boundary via the admin sync endpoint.

import { getEventState } from './events';

describe('getEventState', () => {
  const NOW = new Date('2026-06-12T18:00:00Z');

  it("returns 'upcoming' when startTime is in the future", () => {
    expect(
      getEventState({ startTime: '2026-06-13T00:00:00Z', endTime: null }, NOW),
    ).toBe('upcoming');
    expect(
      getEventState({ startTime: '2026-06-12T18:00:01Z', endTime: null }, NOW),
    ).toBe('upcoming');
  });

  it("returns 'live' when startTime ≤ now ≤ endTime (explicit endTime)", () => {
    expect(
      getEventState({ startTime: '2026-06-12T17:00:00Z', endTime: '2026-06-12T20:00:00Z' }, NOW),
    ).toBe('live');
  });

  it("returns 'live' on null endTime within 4h of startTime (EV-D12 default window)", () => {
    expect(
      getEventState({ startTime: '2026-06-12T15:00:00Z', endTime: null }, NOW),
    ).toBe('live');
    // boundary — exactly 4h after start should still be live
    expect(
      getEventState({ startTime: '2026-06-12T14:00:00Z', endTime: null }, NOW),
    ).toBe('live');
  });

  it("returns 'past' on null endTime more than 4h after startTime", () => {
    expect(
      getEventState({ startTime: '2026-06-12T13:59:59Z', endTime: null }, NOW),
    ).toBe('past');
  });

  it("returns 'past' when explicit endTime is before now", () => {
    expect(
      getEventState({ startTime: '2026-06-10T18:00:00Z', endTime: '2026-06-11T00:00:00Z' }, NOW),
    ).toBe('past');
  });

  it("returns 'live' on the exact start_time boundary", () => {
    expect(
      getEventState({ startTime: '2026-06-12T18:00:00Z', endTime: null }, NOW),
    ).toBe('live');
  });
});
