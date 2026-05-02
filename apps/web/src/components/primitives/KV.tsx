import type { ReactNode } from 'react';

export interface KVProps {
  rows: [string, ReactNode][];
}

export function KV({ rows }: KVProps) {
  return (
    <div className="kv">
      {rows.map(([k, v], i) => (
        <div key={i} style={{ display: 'contents' }}>
          <div className="k">{k}</div>
          <div>{v}</div>
        </div>
      ))}
    </div>
  );
}
