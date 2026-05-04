import { memo } from 'react';

export type GaugeTone = 'default' | 'green' | 'amber';

export interface GaugeProps {
  total: number;
  filled: number;
  tone?: GaugeTone;
}

function GaugeImpl({ total, filled, tone = 'default' }: GaugeProps) {
  const segClass = tone === 'green' ? 'green' : tone === 'amber' ? 'amber' : 'on';
  return (
    <div className="gauge">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className={`seg${i < filled ? ` ${segClass}` : ''}`} />
      ))}
    </div>
  );
}

export const Gauge = memo(GaugeImpl);
