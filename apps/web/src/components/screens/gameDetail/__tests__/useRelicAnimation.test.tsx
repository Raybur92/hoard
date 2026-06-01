/**
 * GD-PR4b — useRelicAnimation first-visit gate tests.
 *
 * Pins the localStorage-based "consecrated" contract: first visit returns
 * true, subsequent visits return false, and the localStorage write fires
 * at sequence end (2400ms).
 */

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useRelicAnimation } from '../useRelicAnimation';

describe('GD-PR4b — useRelicAnimation', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('flips to true on first visit (no localStorage flag)', () => {
    const { result } = renderHook(() => useRelicAnimation('ug1'));
    // React runs the effect synchronously in renderHook; state is now true.
    expect(result.current).toBe(true);
  });

  it('stays false on subsequent visits (localStorage flag present)', () => {
    localStorage.setItem('hoard:relic-consecrated:ug1', '1');
    const { result } = renderHook(() => useRelicAnimation('ug1'));
    expect(result.current).toBe(false);
  });

  it('does nothing when userGameId is null', () => {
    const { result } = renderHook(() => useRelicAnimation(null));
    expect(result.current).toBe(false);
  });

  it('uses per-userGameId scoping — different games animate independently', () => {
    localStorage.setItem('hoard:relic-consecrated:ug1', '1');
    const { result: ug1 } = renderHook(() => useRelicAnimation('ug1'));
    const { result: ug2 } = renderHook(() => useRelicAnimation('ug2'));
    expect(ug1.current).toBe(false); // already consecrated
    expect(ug2.current).toBe(true);  // first visit
  });

  describe('sequence-end localStorage write', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('writes the localStorage flag at sequence end (~2400ms)', () => {
      const { result } = renderHook(() => useRelicAnimation('ug1'));
      expect(result.current).toBe(true);
      expect(localStorage.getItem('hoard:relic-consecrated:ug1')).toBeNull();
      act(() => { vi.advanceTimersByTime(2400); });
      expect(localStorage.getItem('hoard:relic-consecrated:ug1')).toBe('1');
    });

    it('clears the timer on unmount (no write if user navigates away mid-sequence)', () => {
      const { result, unmount } = renderHook(() => useRelicAnimation('ug1'));
      expect(result.current).toBe(true);
      unmount();
      act(() => { vi.advanceTimersByTime(2400); });
      // Flag NOT written because the timer was cleared on unmount.
      expect(localStorage.getItem('hoard:relic-consecrated:ug1')).toBeNull();
    });
  });
});
