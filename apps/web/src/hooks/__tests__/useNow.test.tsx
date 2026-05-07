import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { useNow } from '../useNow';

function Probe({ interval = 1000 }: { interval?: number }) {
  const now = useNow(interval);
  return <span data-testid="now">{now}</span>;
}

describe('useNow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-07T12:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the current timestamp on first render', () => {
    const { getByTestId } = render(<Probe />);
    expect(Number(getByTestId('now').textContent)).toBe(Date.now());
  });

  it('advances on each interval tick', () => {
    const { getByTestId } = render(<Probe interval={1000} />);
    const initial = Number(getByTestId('now').textContent);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(Number(getByTestId('now').textContent)).toBe(initial + 1000);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(Number(getByTestId('now').textContent)).toBe(initial + 3000);
  });

  it('pauses while document.hidden is true and resumes on visibilitychange', () => {
    const { getByTestId } = render(<Probe interval={1000} />);
    const initial = Number(getByTestId('now').textContent);

    // Simulate the tab going to the background.
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    // Frozen — no advance.
    expect(Number(getByTestId('now').textContent)).toBe(initial);

    // Tab is visible again. Resume.
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    vi.setSystemTime(new Date('2026-05-07T12:00:10.000Z'));
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(Number(getByTestId('now').textContent)).toBe(Date.now());
  });
});
