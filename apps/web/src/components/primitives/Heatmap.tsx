import { memo } from 'react';

export interface HeatmapProps {
  /** Number of week columns. Defaults to 24. */
  weeks?: number;
  /** Number of rows per column (one per day-of-week). Defaults to 7. */
  days?: number;
  /**
   * Cell counts in column-major order: `cells[col * days + row]`.
   * If shorter than `weeks * days` the missing cells render as zero. If
   * omitted entirely, every cell renders as zero (empty grid).
   */
  cells?: number[];
}

/**
 * Map a raw cell count (number of distinct games last-played that day) to one
 * of six visual levels matching the `.heat-cell` CSS classes.
 *
 * Most cells will be 0 or 1 because we only have one timestamp per game, not a
 * session log — the highest-intensity cells are days where you switched
 * between several titles.
 */
function toLevel(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count === 3) return 3;
  if (count <= 5) return 4;
  return 5;
}

function HeatmapImpl({ weeks = 24, days = 7, cells }: HeatmapProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${weeks}, 11px)`, gap: 2 }}>
      {Array.from({ length: weeks }, (_, w) => (
        <div key={w} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {Array.from({ length: days }, (_, d) => {
            const count = cells?.[w * days + d] ?? 0;
            const lvl = toLevel(count);
            return <div key={d} className={`heat-cell${lvl ? ` l${lvl}` : ''}`} />;
          })}
        </div>
      ))}
    </div>
  );
}

export const Heatmap = memo(HeatmapImpl);
