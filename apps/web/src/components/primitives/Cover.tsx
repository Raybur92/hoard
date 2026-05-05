import type { CSSProperties, ReactNode } from 'react';
import { igdbCoverSize } from '../../lib/igdbCover';

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
  /** Mark the cover as decorative (alt=""). Use only when the parent
   *  context already announces the game (e.g., a button labelled "Open Elden Ring").
   *  Default: descriptive alt derived from `label` or 'Game cover'. */
  decorative?: boolean;
}

export function Cover({ w, h, src, label, year, dev, bright, style, children, decorative }: CoverProps) {
  if (src) {
    // For numeric widths, downscale IGDB URLs to the smallest variant that
    // covers the rendered size. Non-IGDB URLs pass through.
    const sized = typeof w === 'number' ? igdbCoverSize(src, w) : src;
    const widthAttr = typeof w === 'number' ? w : undefined;
    const heightAttr = typeof h === 'number' ? h : undefined;
    // WCAG 1.1.1: provide descriptive alt unless explicitly decorative.
    const altText = decorative ? '' : (label && label.length > 0 ? `${label} cover art` : 'Game cover');
    return (
      <div style={{ width: w, height: h, overflow: 'hidden', flexShrink: 0, ...style }}>
        <img
          src={sized ?? src}
          alt={altText}
          width={widthAttr}
          height={heightAttr}
          loading="lazy"
          decoding="async"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </div>
    );
  }

  return (
    <div className={`cover-ph${bright ? ' bright' : ''}`} style={{ width: w, height: h, ...style }}>
      <span className="corner">{year ?? ''}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, maxWidth: '100%' }}>
        <span style={{ color: 'var(--paper-dim)', fontSize: "var(--text-2xs)", fontWeight: 500, lineHeight: 1.1, letterSpacing: '0.05em' }}>
          {label}
        </span>
        {dev && (
          <span style={{ fontSize: "var(--text-3xs)", opacity: 0.6 }}>{dev}</span>
        )}
      </div>
      {children}
    </div>
  );
}
