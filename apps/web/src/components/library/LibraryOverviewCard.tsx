import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cover } from '../primitives/Cover';
import { Plat } from '../primitives/Plat';

/**
 * Library OVERVIEW shelf card — landscape variant.
 *
 * Per Andrea 2026-05-31:
 *   "the cards needs to have a different layout, so landscape.
 *    The card needs to have the cover then a platform logo inside
 *    the cover as it is right now, below we put the title of the
 *    game and the playing time on the other side."
 *
 * Layout:
 *   ┌─────────────────────────┐
 *   │ COVER (16:9 crop)  [PS] │
 *   │                         │
 *   ├─────────────────────────┤
 *   │ Title            12h    │   ← title left, playtime right
 *   └─────────────────────────┘
 *
 * Used ONLY on `/library` overview (per Andrea: filtered views keep
 * the existing portrait `ShelfItem`). The cover image is the existing
 * portrait `coverUrl` cropped to 16:9 via `object-fit: cover` (inherited
 * from the `Cover` primitive). For games whose cover art has the title
 * vertically centred this crops cleanly; for games with title at top
 * or bottom the crop can lose detail. Future enhancement: fetch IGDB
 * `screenshots[0]` or `artworks[0]` as a true landscape hero image.
 */
export interface OverviewGameDisplay {
  id: string;
  title: string;
  platformCode: string;
  playtime: string;
  progress: number;
  coverUrl: string | null;
  /** Optional landscape hero image (IGDB artworks[0] or screenshots[0]).
   *  When present, replaces the portrait coverUrl as the card's image
   *  source — gives the 16:9 box proper landscape art instead of a
   *  cropped portrait cover. */
  heroImageUrl: string | null;
}

export interface LibraryOverviewCardProps {
  g: OverviewGameDisplay;
  /** Card width in px. The card is 16:9; height computed from this. */
  w: number;
}

export const LibraryOverviewCard = memo(function LibraryOverviewCard({ g, w }: LibraryOverviewCardProps) {
  const navigate = useNavigate();
  const h = Math.round(w * 9 / 16);
  const tone = g.progress === 100 ? 'var(--paper)' : g.progress > 0 ? 'var(--green)' : 'var(--paper-faint)';
  return (
    <button
      type="button"
      onClick={() => navigate(`/game/${g.id}`)}
      aria-label={`Open ${g.title}`}
      style={{
        width: w,
        flex: '0 0 auto',
        cursor: 'pointer',
        background: 'transparent',
        border: 'none',
        padding: 0,
        font: 'inherit',
        color: 'inherit',
        textAlign: 'left',
      }}
    >
      <div style={{ position: 'relative' }}>
        <Cover w={w} h={h} src={g.heroImageUrl ?? g.coverUrl} label={g.title.toUpperCase()} bright={g.progress > 0} />
        <div style={{ position: 'absolute', top: 6, right: 6 }}>
          <Plat code={g.platformCode} />
        </div>
        {g.progress > 0 && (
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: 'rgba(0,0,0,0.4)' }}>
            <div style={{ height: '100%', width: `${g.progress}%`, background: tone }} />
          </div>
        )}
      </div>
      <div
        style={{
          marginTop: 8,
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
          fontSize: 'var(--text-2xs)',
          lineHeight: 1.2,
        }}
      >
        <span
          style={{
            flex: 1,
            minWidth: 0,
            color: 'var(--paper)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {g.title}
        </span>
        <span className="t-tnum t-faint" style={{ flexShrink: 0 }}>
          {g.playtime}
        </span>
      </div>
    </button>
  );
});
