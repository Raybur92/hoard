/**
 * GD-PR2 — horizontal scroller of IGDB screenshots.
 *
 * Each thumb uses IGDB's `t_screenshot_med` size (569×320). Click opens
 * the full-res `t_screenshot_huge` (1280×720) in a new tab. Lightbox
 * modal is deferred to a polish PR.
 *
 * Hidden entirely when IGDB returned no screenshots.
 */

import type { CSSProperties } from 'react';
import { Marker } from '../../primitives/Marker';

interface Props {
  screenshotIds: string[];
  title: string;
}

const thumbStyle: CSSProperties = {
  flex: '0 0 auto',
  width: 280,
  height: 158,
  background: 'var(--ink-2)',
  border: '1px solid var(--rule)',
  cursor: 'zoom-in',
  display: 'block',
  objectFit: 'cover',
};

export function ScreenshotsRail({ screenshotIds, title }: Props) {
  if (screenshotIds.length === 0) return null;

  return (
    <section style={{ marginTop: 24, maxWidth: 1100 }}>
      <Marker>{`// screenshots · ${screenshotIds.length}`}</Marker>
      <div
        className="thin-scroll"
        style={{
          display: 'flex',
          gap: 10,
          marginTop: 12,
          overflowX: 'auto',
          paddingBottom: 8,
        }}
      >
        {screenshotIds.map((id) => {
          const thumb = `https://images.igdb.com/igdb/image/upload/t_screenshot_med/${id}.jpg`;
          const full = `https://images.igdb.com/igdb/image/upload/t_screenshot_huge/${id}.jpg`;
          return (
            <a key={id} href={full} target="_blank" rel="noopener noreferrer" aria-label={`${title} screenshot — open full resolution`}>
              <img src={thumb} alt={`${title} screenshot`} loading="lazy" decoding="async" style={thumbStyle} />
            </a>
          );
        })}
      </div>
    </section>
  );
}
