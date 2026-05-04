import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { useQuery } from '../useQuery';
import * as cache from '../../lib/cache';

beforeEach(() => {
  cache._resetForTests();
});

function Probe<T>({
  k, fetcher,
}: { k: string; fetcher: () => Promise<T> }) {
  const { data, loading } = useQuery<T>(k, fetcher);
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="data">{data === undefined ? '∅' : JSON.stringify(data)}</span>
    </div>
  );
}

describe('useQuery', () => {
  it('returns loading on first mount with empty cache, then data', async () => {
    const fetcher = vi.fn().mockResolvedValue({ x: 1 });
    const { getByTestId } = render(<Probe k="t1" fetcher={fetcher} />);

    expect(getByTestId('loading').textContent).toBe('true');
    expect(getByTestId('data').textContent).toBe('∅');

    await waitFor(() => expect(getByTestId('loading').textContent).toBe('false'));
    expect(getByTestId('data').textContent).toBe(JSON.stringify({ x: 1 }));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('serves cached data instantly on second mount, no fetch', async () => {
    cache.set('t2', { hit: true });
    const fetcher = vi.fn().mockResolvedValue({ hit: false });
    const { getByTestId } = render(<Probe k="t2" fetcher={fetcher} />);

    // No skeleton — data ready on first render.
    expect(getByTestId('loading').textContent).toBe('false');
    expect(getByTestId('data').textContent).toBe(JSON.stringify({ hit: true }));

    // staleMs default is 30s, so no background fetch fires.
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('dedupes concurrent mounts with the same key into a single fetch', async () => {
    let resolve: (v: unknown) => void = () => {};
    const fetcher = vi.fn(() => new Promise((r) => { resolve = r; }));

    const { getAllByTestId } = render(
      <>
        <Probe k="t3" fetcher={fetcher} />
        <Probe k="t3" fetcher={fetcher} />
        <Probe k="t3" fetcher={fetcher} />
      </>,
    );

    expect(fetcher).toHaveBeenCalledTimes(1);

    await act(async () => { resolve({ shared: true }); });

    await waitFor(() =>
      getAllByTestId('data').forEach((el) =>
        expect(el.textContent).toBe(JSON.stringify({ shared: true }))));
  });

  it('subscribers re-render when cache.invalidate matches the key', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ v: 1 })
      .mockResolvedValueOnce({ v: 2 });

    const { getByTestId } = render(<Probe k="t4" fetcher={fetcher} />);
    await waitFor(() =>
      expect(getByTestId('data').textContent).toBe(JSON.stringify({ v: 1 })));

    await act(async () => { cache.invalidate('t4'); });

    await waitFor(() =>
      expect(getByTestId('data').textContent).toBe(JSON.stringify({ v: 2 })));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
