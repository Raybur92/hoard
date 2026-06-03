import type { EventDetailRow } from '@hoard/types';
import { Icon } from '../../primitives/Icon';

export interface EventVideoGridProps {
  videos: EventDetailRow['videos'];
  mobile?: boolean;
}

/**
 * Past-event polish (Andrea 2026-06-03): replace the text-only `<a>` rows
 * with a media-first grid. Each card uses YouTube's free thumbnail
 * (`img.youtube.com/vi/{id}/maxresdefault.jpg`) as cover art, with a
 * subtle vignette + play glyph overlay so the affordance is clear.
 *
 * `maxresdefault` is missing for some older / less-popular videos; the
 * onError handler falls back to `hqdefault` which is always available.
 *
 * Mobile: 2-col grid per OQ-EV-9.
 */
export function EventVideoGrid({ videos, mobile }: EventVideoGridProps) {
  if (videos.length === 0) return null;
  const cols = mobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(220px, 1fr))';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 16 }}>
      {videos.map((v) => (
        <a
          key={v.youtubeId}
          href={`https://www.youtube.com/watch?v=${encodeURIComponent(v.youtubeId)}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            textDecoration: 'none',
            color: 'inherit',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div style={{
            position: 'relative',
            aspectRatio: '16 / 9',
            background: 'var(--ink-2)',
            border: '1px solid var(--rule)',
            overflow: 'hidden',
          }}>
            <img
              src={`https://img.youtube.com/vi/${encodeURIComponent(v.youtubeId)}/maxresdefault.jpg`}
              alt=""
              loading="lazy"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              onError={(e) => {
                const img = e.currentTarget;
                if (!img.dataset['fallback']) {
                  img.dataset['fallback'] = '1';
                  img.src = `https://img.youtube.com/vi/${encodeURIComponent(v.youtubeId)}/hqdefault.jpg`;
                }
              }}
            />
            {/* Vignette for play-glyph contrast against bright thumbnails. */}
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(180deg, rgba(7,9,10,0) 50%, rgba(7,9,10,0.55))',
            }} />
            {/* Play glyph — small, centered, paper color so it reads on any thumb. */}
            <div style={{
              position: 'absolute', inset: 0,
              display: 'grid', placeItems: 'center',
              color: 'var(--paper)',
            }}>
              <div style={{
                width: 40, height: 40,
                display: 'grid', placeItems: 'center',
                background: 'rgba(7, 9, 10, 0.7)',
                border: '1px solid var(--rule-bright)',
                borderRadius: 2,
              }}>
                <Icon name="play" size={16} />
              </div>
            </div>
          </div>
          <div style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--paper)',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical' as const,
            overflow: 'hidden',
            lineHeight: 1.3,
          }}>
            {v.name ?? 'watch on youtube'}
          </div>
        </a>
      ))}
    </div>
  );
}
