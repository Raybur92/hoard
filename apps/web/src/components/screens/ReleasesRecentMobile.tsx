import { useNavigate } from 'react-router-dom';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { MobileHeader } from '../layout/MobileHeader';
import { Marker } from '../primitives/Marker';
import { Btn } from '../primitives/Btn';
import { Icon } from '../primitives/Icon';
import { useQuery } from '../../hooks/useQuery';
import { api } from '../../lib/api';
import type { IgdbUpcomingRelease, RecentReleasesResponse } from '@hoard/types';

import { MobileReleaseRow } from './releases/MobileReleaseRow';

/* ────────────────────────────────────────────────────────────────────────
 * RECENT (mobile) — handoff §10.
 *
 * Reached only via [view recent →] on the conditional banner. Has no other
 * entry points and no time-axis chrome. Uses the existing `MobileHeader`
 * (just back arrow + title) — the view-label header is for the main
 * Releases page only.
 *
 * Layout per handoff §10 mobile:
 *   - MobileHeader with back arrow, title 'releases', sub '// recent · last 14d'.
 *   - Green panel at top — informational, no action button.
 *   - // just out · starred  — panel-style cards (one per row, full-width)
 *   - // also out · not starred — inline list rows (denser)
 *
 * The visual asymmetry (panels for starred, rows for non-starred) is
 * intentional per handoff §10 — starred drops get more visual weight
 * because they're the user's stuff.
 *
 * No `[mark all owned]` or `[i got it]` button anywhere — handoff §5 + §10.
 * ──────────────────────────────────────────────────────────────────────── */

export function ReleasesRecentMobile() {
  useDocumentTitle('Recent · Releases');
  const navigate = useNavigate();
  const { data, loading, error, refetch } = useQuery<RecentReleasesResponse>(
    'releases:recent',
    () => api.releasesRecent(),
  );

  const starred = data?.starred ?? [];
  const hyped = data?.hyped ?? [];
  const isEmpty = !loading && !error && data && starred.length === 0 && hyped.length === 0;

  return (
    <>
      <MobileHeader
        title="releases"
        sub="// recent · last 14d"
        back
        onBack={() => navigate('/releases')}
      />

      <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '12px 16px 16px' }}>
        {loading && !data && <Marker>// loading…</Marker>}

        {!loading && error && (
          <>
            <Marker>// couldn&rsquo;t load recent releases</Marker>
            <p style={{ marginTop: 8, color: 'var(--paper-dim)', fontSize: 'var(--text-xs)' }}>
              {String(error)}
            </p>
            <div style={{ marginTop: 10 }}>
              <Btn sm onClick={() => void refetch()}>retry</Btn>
            </div>
          </>
        )}

        {isEmpty && (
          <>
            <Marker>// nothing in the last 14 days</Marker>
            <p style={{ marginTop: 8, color: 'var(--paper-dim)', fontSize: 'var(--text-xs)' }}>
              no starred or high-hype releases dropped recently.
            </p>
            <div style={{ marginTop: 10 }}>
              <Btn variant="primary" onClick={() => navigate('/releases')}>
                back to releases
              </Btn>
            </div>
          </>
        )}

        {!loading && !error && data && !isEmpty && (
          <>
            <RecentMobilePromptStrip />

            {starred.length > 0 && (
              <section style={{ marginTop: 14 }}>
                <Marker>// just out · starred · {starred.length}</Marker>
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {starred.map((r) => (
                    <StarredPanelCard
                      key={r.igdbId}
                      release={r}
                      onTap={() => navigate(`/game/${r.igdbId}`)}
                    />
                  ))}
                </div>
              </section>
            )}

            {hyped.length > 0 && (
              <section style={{ marginTop: 18 }}>
                <Marker>// also out · not starred · {hyped.length}</Marker>
                <div style={{ marginTop: 6 }}>
                  {hyped.map((r) => (
                    <MobileReleaseRow
                      key={r.igdbId}
                      release={r}
                      onTap={() => navigate(`/game/${r.igdbId}`)}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}

function RecentMobilePromptStrip() {
  return (
    <div
      role="note"
      style={{
        padding: '10px 12px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        border: '1px solid var(--green-dim)',
        background: 'rgba(95,194,106,0.04)',
      }}
    >
      <Icon name="check" size={14} style={{ color: 'var(--green)', marginTop: 2 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          className="t-up"
          style={{ fontSize: 'var(--text-3xs)', letterSpacing: '0.12em', color: 'var(--green)' }}
        >
          // recent drops
        </div>
        <div className="t-faint" style={{ fontSize: 'var(--text-3xs)', marginTop: 3, lineHeight: 1.45 }}>
          they&rsquo;ll move to your library automatically once your platforms sync.
        </div>
      </div>
    </div>
  );
}

/**
 * Panel-style card for the `// just out · starred` section. Wider, bolder
 * than the row pattern used by the second section — handoff §10 calls for
 * "panel-style cards (one per row, full-width)" specifically because starred
 * drops get more visual weight.
 */
function StarredPanelCard({
  release,
  onTap,
}: {
  release: IgdbUpcomingRelease;
  onTap: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={`Open ${release.title}`}
      className="panel"
      style={{
        display: 'block',
        width: '100%',
        padding: 0,
        background: 'transparent',
        cursor: 'pointer',
        textAlign: 'left',
        color: 'inherit',
      }}
    >
      <div style={{ padding: 12 }}>
        <MobileReleaseRow release={release} />
      </div>
    </button>
  );
}
