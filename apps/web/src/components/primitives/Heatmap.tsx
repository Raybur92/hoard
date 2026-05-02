export interface HeatmapProps {
  weeks?: number;
  days?: number;
  density?: number;
}

export function Heatmap({ weeks = 24, days = 7, density = 0.55 }: HeatmapProps) {
  const cells: number[] = [];
  let seed = 7;
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < days; d++) {
      seed = (seed * 9301 + 49297) % 233280;
      const r = seed / 233280;
      let lvl = 0;
      if (r < density * 0.45) lvl = 1;
      if (r < density * 0.32) lvl = 2;
      if (r < density * 0.18) lvl = 3;
      if (r < density * 0.08) lvl = 4;
      if (r < density * 0.03) lvl = 5;
      cells.push(lvl);
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${weeks}, 11px)`, gap: 2 }}>
      {Array.from({ length: weeks }, (_, w) => (
        <div key={w} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {Array.from({ length: days }, (_, d) => {
            const lvl = cells[w * days + d] ?? 0;
            return <div key={d} className={`heat-cell${lvl ? ` l${lvl}` : ''}`} />;
          })}
        </div>
      ))}
    </div>
  );
}
