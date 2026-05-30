/**
 * DASH-PR3 — AlertsStrip unit tests.
 *
 * The strip is the first chip surface in the bento alerts row. Today
 * it surfaces a single chip type (sync-error platforms aggregated); future
 * workstreams (Q-series pending-review, EV-PR3 events-missed, Deals)
 * thread additional chips through this same component, so the contract
 * tested here matters for the next round too.
 */

import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, useLocation, Routes, Route } from 'react-router-dom';
import { AlertsStrip } from '../AlertsStrip';
import type { Platform } from '@hoard/types';

function makePlatform(code: Platform['code'], syncStatus: Platform['syncStatus']): Platform {
  return {
    id: `${code}-1`,
    userId: 'u1',
    code,
    syncable: true,
    lastSyncAt: '2026-05-30T10:00:00.000Z',
    syncStatus,
    syncFrequency: 'HOURLY',
  } as Platform;
}

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname}</div>;
}

function renderStrip(platforms: Platform[]) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route
          path="/"
          element={
            <>
              <AlertsStrip platforms={platforms} />
              <LocationProbe />
            </>
          }
        />
        <Route path="/settings/platforms" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AlertsStrip — sync-error chip', () => {
  it('returns null when no platforms are connected', () => {
    const { container } = renderStrip([]);
    // Component renders only the LocationProbe; AlertsStrip itself is null.
    expect(container.querySelector('[data-testid="alerts-strip"]')).toBeNull();
  });

  it('returns null when no platform is in error state', () => {
    const { container } = renderStrip([
      makePlatform('ST', 'ok'),
      makePlatform('PS', 'syncing'),
      makePlatform('XB', 'stale'),
    ]);
    expect(container.querySelector('[data-testid="alerts-strip"]')).toBeNull();
  });

  it('renders the chip with the platform code when exactly one platform is in error', () => {
    const { queryByTestId, getByRole } = renderStrip([
      makePlatform('ST', 'error'),
      makePlatform('PS', 'ok'),
    ]);
    const strip = queryByTestId('alerts-strip');
    expect(strip).not.toBeNull();
    expect(strip!.textContent ?? '').toContain('sync error');
    expect(strip!.textContent ?? '').toContain('steam');
    // Accessible label spells out the count for screen readers.
    expect(getByRole('button').getAttribute('aria-label')).toMatch(/1 platform failed to sync/i);
  });

  it('aggregates two errored platforms into a single chip listing both codes inline', () => {
    const { queryByTestId, getByRole } = renderStrip([
      makePlatform('ST', 'error'),
      makePlatform('PS', 'error'),
      makePlatform('XB', 'ok'),
    ]);
    const strip = queryByTestId('alerts-strip');
    expect(strip).not.toBeNull();
    const text = strip!.textContent ?? '';
    expect(text).toContain('steam');
    expect(text).toContain('psn');
    // Single chip, not two separate ones (single aggregated per Andrea's lock).
    expect(strip!.querySelectorAll('button')).toHaveLength(1);
    expect(getByRole('button').getAttribute('aria-label')).toMatch(/2 platforms failed to sync/i);
  });

  it('collapses to a count when three or more platforms are in error (avoids chip-overflow)', () => {
    const { queryByTestId } = renderStrip([
      makePlatform('ST', 'error'),
      makePlatform('PS', 'error'),
      makePlatform('XB', 'error'),
      makePlatform('GG', 'error'),
    ]);
    const text = queryByTestId('alerts-strip')!.textContent ?? '';
    expect(text).toContain('4 platforms');
    // Inline list is dropped at >= 3 to keep the strip slim.
    expect(text).not.toContain('steam · psn');
  });

  it('clicking the chip navigates to /settings/platforms (where the user can re-auth / view logs)', () => {
    const { getByRole, getByTestId } = renderStrip([
      makePlatform('ST', 'error'),
    ]);

    fireEvent.click(getByRole('button'));

    expect(getByTestId('location').textContent).toBe('/settings/platforms');
  });

  it('chip is NOT dismissible — no [×] close affordance (per Andrea\'s lock; auto-disappears when error clears)', () => {
    const { queryByTestId } = renderStrip([
      makePlatform('ST', 'error'),
    ]);
    const strip = queryByTestId('alerts-strip')!;
    // Exactly one button (the chip itself); no separate dismiss button.
    expect(strip.querySelectorAll('button')).toHaveLength(1);
    // Defensive — no aria-label suggesting dismissibility.
    expect(strip.textContent ?? '').not.toMatch(/dismiss|close|hide/i);
  });

  it('still renders the chip when an errored platform has syncable=false (e.g. a platform that errored and was then disabled)', () => {
    // Edge case: a previously-syncable platform errors out, user toggles
    // syncable off. The Platform row still has syncStatus='error'; the
    // chip surfaces it — the user might want to re-enable + retry.
    const platform: Platform = { ...makePlatform('ST', 'error'), syncable: false };
    const { queryByTestId } = renderStrip([platform]);
    expect(queryByTestId('alerts-strip')).not.toBeNull();
  });
});

// Ensure the `vi` import isn't tree-shaken if no `.mock()` calls remain.
void vi;
