import { Gauge } from './Gauge';

export interface HypeBarsProps {
  n: number;
}

export function HypeBars({ n }: HypeBarsProps) {
  return <Gauge total={5} filled={Math.min(5, Math.max(0, n))} tone="amber" />;
}
