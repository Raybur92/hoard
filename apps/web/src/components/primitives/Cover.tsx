import type { CSSProperties, ReactNode } from 'react';

export interface CoverProps {
  w: number | string;
  h: number | string;
  src?: string | null;
  label?: string;
  year?: number | string | null;
  dev?: string | null;
  bright?: boolean;
  style?: CSSProperties;
  children?: ReactNode;
}

export function Cover({ w, h, src, label, year, dev, bright, style, children }: CoverProps) {
  if (src) {
    return (
      <div style={{ width: w, height: h, overflow: 'hidden', flexShrink: 0, ...style }}>
        <img
          src={src}
          alt={label ?? ''}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </div>
    );
  }

  return (
    <div className={`cover-ph${bright ? ' bright' : ''}`} style={{ width: w, height: h, ...style }}>
      <span className="corner">{year ?? ''}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, maxWidth: '100%' }}>
        <span style={{ color: 'var(--paper-dim)', fontSize: 9, fontWeight: 500, lineHeight: 1.1, letterSpacing: '0.05em' }}>
          {label}
        </span>
        {dev && (
          <span style={{ fontSize: 7, opacity: 0.6 }}>{dev}</span>
        )}
      </div>
      {children}
    </div>
  );
}
