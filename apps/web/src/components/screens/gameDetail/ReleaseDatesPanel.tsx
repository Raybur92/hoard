/**
 * GD-PR2 — release-dates-per-region-platform expandable panel.
 *
 * Hidden entirely when IGDB returned no entries (older catalog games
 * often don't have per-region data; the parent S2 hero already surfaces
 * the earliest date). Collapsed by default — click `// release dates ▾`
 * to expand the full breakdown.
 */

import { useState } from 'react';
import type { ReleaseDateEntry } from '@hoard/types';
import { Marker } from '../../primitives/Marker';

interface Props {
  entries: ReleaseDateEntry[];
}

function formatDate(iso: string | null): string {
  if (!iso) return 'TBA';
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

export function ReleaseDatesPanel({ entries }: Props) {
  const [open, setOpen] = useState(false);

  if (entries.length === 0) return null;

  return (
    <section className="panel" style={{ padding: 16, marginTop: 24, maxWidth: 1100 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          fontFamily: 'var(--mono)',
          color: 'var(--paper)',
        }}
        aria-expanded={open}
      >
        <Marker>{`// release dates · ${entries.length}`}</Marker>
        <span className="t-faint" style={{ fontSize: 'var(--text-xs)' }}>
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column' }}>
          {entries.map((e, i) => (
            <div
              key={i}
              className="t-mono"
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 140px 1fr',
                gap: 14,
                padding: '6px 0',
                borderBottom: i < entries.length - 1 ? '1px solid var(--rule)' : 'none',
                fontSize: 'var(--text-sm)',
                color: 'var(--paper-dim)',
              }}
            >
              <span className="t-tnum" style={{ color: 'var(--paper)' }}>{formatDate(e.date)}</span>
              <span>{e.region ?? '—'}</span>
              <span>{e.platform ?? '—'}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
