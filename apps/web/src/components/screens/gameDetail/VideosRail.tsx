/**
 * GD-PR2 — IGDB videos rail. Each entry is a YouTube video_id; thumbs
 * come from `i.ytimg.com/vi/<id>/hqdefault.jpg` (free, no CSP issues),
 * click opens the YouTube watch URL in a new tab.
 *
 * Inline iframe embed is deferred to a polish PR — adding `youtube.com`
 * to the CSP frame-src can ride along with that change.
 */

import type { CSSProperties } from 'react';
import { Marker } from '../../primitives/Marker';

interface Props {
  videoIds: string[];
  title: string;
}

const wrapperStyle: CSSProperties = {
  flex: '0 0 auto',
  width: 240,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  textDecoration: 'none',
};

const thumbStyle: CSSProperties = {
  width: 240,
  height: 135,
  background: 'var(--ink-2)',
  border: '1px solid var(--rule)',
  display: 'block',
  objectFit: 'cover',
  position: 'relative',
};

const playOverlayStyle: CSSProperties = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 48,
  height: 48,
  borderRadius: '50%',
  background: 'rgba(0,0,0,0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--paper)',
  fontSize: 18,
  pointerEvents: 'none',
};

export function VideosRail({ videoIds, title }: Props) {
  if (videoIds.length === 0) return null;

  return (
    <section style={{ marginTop: 24, maxWidth: 1100 }}>
      <Marker>{`// videos · ${videoIds.length}`}</Marker>
      <div
        className="thin-scroll"
        style={{
          display: 'flex',
          gap: 12,
          marginTop: 12,
          overflowX: 'auto',
          paddingBottom: 8,
        }}
      >
        {videoIds.map((id) => {
          const thumb = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
          const watch = `https://www.youtube.com/watch?v=${id}`;
          return (
            <a
              key={id}
              href={watch}
              target="_blank"
              rel="noopener noreferrer"
              style={wrapperStyle}
              aria-label={`${title} video — open on YouTube`}
            >
              <div style={{ position: 'relative' }}>
                <img src={thumb} alt={`${title} video thumbnail`} loading="lazy" decoding="async" style={thumbStyle} />
                <div style={playOverlayStyle}>▶</div>
              </div>
              <span className="t-mono t-faint" style={{ fontSize: 'var(--text-2xs)' }}>youtube →</span>
            </a>
          );
        })}
      </div>
    </section>
  );
}
