import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { LensIndexResponse } from '@hoard/types';
import { slugifyTag } from '../../lib/tagSlug';

/**
 * B-IGDB-3b2 — `// browse by` panel on the Library overview.
 *
 * Three rows (genre · theme · perspective). Each row defaults to a
 * collapsed top-3 preview + `[show all N →]` link. Click "show all"
 * → row expands inline to show every value as a chip row. Click any
 * value → navigates to `/library/by-{dim}/{slug}` (the primary-lens
 * route, where the user can apply secondary filters).
 *
 * Hides any dimension whose count is zero (progressive disclosure —
 * matches the FilterPopover pattern: don't render an affordance for
 * data that doesn't exist).
 */
const TOP_N = 3;

interface RowProps {
  dimension: 'genre' | 'theme' | 'perspective';
  label: string;
  routeBase: string; // '/library/by-genre' etc.
  values: { name: string; count: number }[];
}

function Row({ dimension, label, routeBase, values }: RowProps) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  if (values.length === 0) return null;
  const visible = expanded ? values : values.slice(0, TOP_N);
  const remaining = values.length - TOP_N;

  return (
    <div
      data-testid={`browse-by-${dimension}`}
      style={{
        display: 'grid',
        gridTemplateColumns: '90px 1fr',
        gap: 16,
        alignItems: 'flex-start',
        padding: '6px 0',
      }}
    >
      <span
        className="t-up t-faint"
        style={{ fontSize: 'var(--text-3xs)', paddingTop: 7 }}
      >
        {label}
      </span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {visible.map((v) => (
          <button
            key={v.name}
            type="button"
            className="chip"
            onClick={() => navigate(`${routeBase}/${slugifyTag(v.name)}`)}
            aria-label={`Browse ${label} ${v.name}`}
          >
            <span style={{ whiteSpace: 'nowrap' }}>{v.name.toLowerCase()}</span>
            <span className="t-faint" style={{ fontSize: 'var(--text-2xs)' }}>({v.count})</span>
          </button>
        ))}
        {!expanded && remaining > 0 && (
          <button
            type="button"
            className="t-mono t-faint"
            onClick={() => setExpanded(true)}
            data-testid={`browse-by-${dimension}-expand`}
            style={{
              fontSize: 'var(--text-2xs)',
              background: 'transparent',
              border: 'none',
              padding: '4px 8px',
              cursor: 'pointer',
              color: 'inherit',
              fontFamily: 'inherit',
            }}
          >
            show all {values.length} →
          </button>
        )}
      </div>
    </div>
  );
}

interface BrowseByPanelProps {
  data: LensIndexResponse | null;
}

export function BrowseByPanel({ data }: BrowseByPanelProps) {
  if (!data) return null;
  const anyData = data.genre.length > 0 || data.theme.length > 0 || data.perspective.length > 0;
  if (!anyData) return null;
  return (
    <div data-testid="browse-by-panel" style={{ padding: '24px 0' }}>
      <div className="shelf-label" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span className="t-up t-faint" style={{ fontSize: 'var(--text-2xs)' }}>browse by</span>
        <span style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
      </div>
      <Row dimension="genre"       label="genre"       routeBase="/library/by-genre"       values={data.genre} />
      <Row dimension="theme"       label="theme"       routeBase="/library/by-theme"       values={data.theme} />
      <Row dimension="perspective" label="perspective" routeBase="/library/by-perspective" values={data.perspective} />
    </div>
  );
}
