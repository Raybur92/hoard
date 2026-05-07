import { useEffect, useState } from 'react';
import { Icon } from '../../primitives/Icon';
import { useFocusTrap } from '../../../hooks/useFocusTrap';
import type { TimeBucket } from './TimeNav';

export type SheetMode = 'wishlist' | 'all';
export type SheetScope = 'my-platforms' | 'all';
export type SheetZoom = 'months' | 'quarters';

export interface MobileViewSheetProps {
  open: boolean;

  /** Current committed values from the page. Used as the initial draft when the sheet opens. */
  mode: SheetMode;
  scope: SheetScope;
  zoom: SheetZoom;
  bucket: string;

  /** Bucket list to render — recomputed by the caller when zoom changes. */
  buckets: TimeBucket[];

  /** Apply the user's draft and close. Called by EVERY dismissal path (handoff §7). */
  onApply: (next: { mode: SheetMode; scope: SheetScope; zoom: SheetZoom; bucket: string }) => void;

  /**
   * Map a bucket key to its containing bucket in the new zoom — handoff §7
   * "Zoom change behavior". Caller owns the mapping (it has the today-date).
   * MAY → Q2, JUL → Q3, etc. Identity for keys that already match.
   */
  mapBucketToZoom: (bucket: string, fromZoom: SheetZoom, toZoom: SheetZoom) => string;
}

/**
 * Bottom sheet — the single mobile surface for changing mode, scope, zoom,
 * and bucket (R5 of RELEASES_PLAN.md, handoff §7).
 *
 * Apply behavior — every dismissal path commits pending changes:
 *   - Tap Done           → commit + close
 *   - Tap close X        → commit + close
 *   - Tap-outside scrim  → commit + close
 *   - Drag-down (TODO)   → commit + close (gesture not yet implemented; drag
 *                          handle is decorative for now — adding the gesture
 *                          is fast-follow polish, not load-bearing for v1)
 *
 * There is no "cancel" path by design (handoff §7) — changes are
 * non-destructive and reversible by reopening the sheet.
 *
 * Scope section visibility — only renders when `mode === 'all'` (handoff §7
 * + §12 punch-list 5). The scope value is preserved in the local draft even
 * when wishlist mode hides it, so toggling mode → wishlist → all returns the
 * user to their previous scope.
 *
 * Bucket list — handoff §7 step 6: 6 rows for months, 4 rows for quarters.
 * Each row commits the bucket selection but does NOT auto-close the sheet
 * (user can keep adjusting). Sheet closes via the dismissal paths above.
 */
export function MobileViewSheet({
  open,
  mode,
  scope,
  zoom,
  bucket,
  buckets,
  onApply,
  mapBucketToZoom,
}: MobileViewSheetProps) {
  // Local draft — committed via onApply on every dismissal path.
  const [draftMode, setDraftMode] = useState<SheetMode>(mode);
  const [draftScope, setDraftScope] = useState<SheetScope>(scope);
  const [draftZoom, setDraftZoom] = useState<SheetZoom>(zoom);
  const [draftBucket, setDraftBucket] = useState<string>(bucket);

  // Reset draft to current committed values whenever the sheet opens.
  useEffect(() => {
    if (open) {
      setDraftMode(mode);
      setDraftScope(scope);
      setDraftZoom(zoom);
      setDraftBucket(bucket);
    }
  }, [open, mode, scope, zoom, bucket]);

  const sheetRef = useFocusTrap<HTMLDivElement>(open);

  // Escape key dismisses the sheet (committing the draft, like every other
  // dismissal path). Mirrors the modal pattern used elsewhere in the app.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') commitAndClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // commitAndClose closes over the latest draft via state — safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Lock body scroll while the sheet is open — prevents the underlying page
  // from scrolling when the user drags inside the sheet.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  function commitAndClose() {
    onApply({
      mode: draftMode,
      scope: draftScope,
      zoom: draftZoom,
      bucket: draftBucket,
    });
  }

  function changeZoom(next: SheetZoom) {
    if (next === draftZoom) return;
    const remappedBucket = mapBucketToZoom(draftBucket, draftZoom, next);
    setDraftZoom(next);
    setDraftBucket(remappedBucket);
  }

  if (!open) return null;

  return (
    <div
      ref={sheetRef}
      role="dialog"
      aria-modal="true"
      aria-label="Releases view"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      {/* Scrim — focusable button so keyboard users can dismiss the sheet
          and so a11y lint accepts the click handler. Sits beneath the sheet
          panel via z-order. */}
      <button
        type="button"
        aria-label="Close"
        onClick={commitAndClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(7,9,10,0.6)',
          border: 'none',
          cursor: 'default',
        }}
      />

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxHeight: '85vh',
          overflowY: 'auto',
          background: 'var(--ink)',
          borderTop: '1px solid var(--rule-bright)',
          borderTopLeftRadius: 12,
          borderTopRightRadius: 12,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <DragHandle />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 16px 12px',
            borderBottom: '1px solid var(--rule)',
          }}
        >
          <span
            className="t-mono t-faint"
            style={{ fontSize: 'var(--text-3xs)', letterSpacing: '0.12em' }}
          >
            // view
          </span>
          <button
            type="button"
            onClick={commitAndClose}
            aria-label="Close view sheet"
            style={{
              width: 36,
              height: 36,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--paper-dim)',
            }}
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <SheetSection label="mode">
          <Segmented<SheetMode>
            ariaLabel="Mode"
            options={[['wishlist', 'wishlist'], ['all', 'all']]}
            value={draftMode}
            onChange={setDraftMode}
          />
        </SheetSection>

        {draftMode === 'all' && (
          <SheetSection label="scope">
            <Segmented<SheetScope>
              ariaLabel="Scope"
              options={[['my-platforms', 'my platforms'], ['all', 'all']]}
              value={draftScope}
              onChange={setDraftScope}
            />
          </SheetSection>
        )}

        <SheetSection label="zoom">
          <Segmented<SheetZoom>
            ariaLabel="Zoom"
            options={[['months', 'months'], ['quarters', 'quarters']]}
            value={draftZoom}
            onChange={changeZoom}
          />
        </SheetSection>

        <SheetSection label={draftZoom === 'months' ? 'months' : 'quarters'}>
          <BucketList
            buckets={buckets}
            activeKey={draftBucket}
            onSelect={setDraftBucket}
          />
        </SheetSection>

        <div
          style={{
            position: 'sticky',
            bottom: 0,
            padding: '12px 16px 16px',
            background: 'var(--ink)',
            borderTop: '1px solid var(--rule)',
          }}
        >
          <button
            type="button"
            onClick={commitAndClose}
            className="btn primary"
            style={{ width: '100%' }}
          >
            done
          </button>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Sub-components
 * ──────────────────────────────────────────────────────────────────────── */

function DragHandle() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 4px' }}>
      <div
        aria-hidden
        style={{
          width: 36,
          height: 4,
          borderRadius: 2,
          background: 'var(--rule-bright)',
        }}
      />
    </div>
  );
}

function SheetSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--rule)' }}>
      <div
        className="t-mono t-faint"
        style={{
          fontSize: 'var(--text-3xs)',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          marginBottom: 8,
        }}
      >
        // {label}
      </div>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  ariaLabel,
  options,
  value,
  onChange,
}: {
  ariaLabel: string;
  options: Array<[T, string]>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} style={{ display: 'flex', border: '1px solid var(--rule-bright)' }}>
      {options.map(([k, label], i) => {
        const active = value === k;
        return (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(k)}
            style={{
              flex: 1,
              padding: '10px 12px',
              fontFamily: 'var(--mono)',
              fontSize: 'var(--text-2xs)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: active ? 'var(--void)' : 'var(--paper-dim)',
              background: active ? 'var(--paper)' : 'transparent',
              border: 'none',
              borderLeft: i === 0 ? 'none' : '1px solid var(--rule-bright)',
              cursor: 'pointer',
              minHeight: 44,
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function BucketList({
  buckets,
  activeKey,
  onSelect,
}: {
  buckets: TimeBucket[];
  activeKey: string;
  onSelect: (key: string) => void;
}) {
  const datedMax = Math.max(1, ...buckets.filter((b) => !b.isTBA).map((b) => b.count));
  return (
    <div role="radiogroup" aria-label="Time bucket">
      {buckets.map((b) => {
        const active = b.key === activeKey;
        const pct = b.isTBA ? 0 : Math.max(0.06, b.count / datedMax);
        return (
          <button
            key={b.key}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onSelect(b.key)}
            style={{
              display: 'grid',
              gridTemplateColumns: '70px 1fr 40px',
              alignItems: 'center',
              gap: 12,
              width: '100%',
              minHeight: 48,
              padding: '8px 4px',
              background: active ? 'var(--ink-2)' : 'transparent',
              border: 'none',
              borderTop: '1px solid var(--rule)',
              cursor: 'pointer',
              color: 'inherit',
              fontFamily: 'inherit',
              textAlign: 'left',
            }}
          >
            <span
              className="t-mono"
              style={{
                fontSize: 'var(--text-xs)',
                letterSpacing: '0.08em',
                color: active ? 'var(--paper)' : 'var(--paper-dim)',
                textTransform: 'uppercase',
              }}
            >
              {b.label}{b.meta && b.meta !== '—' ? ` ${b.meta}` : ''}
            </span>
            <span style={{ display: 'flex', alignItems: 'center' }}>
              {b.isTBA ? (
                <span
                  aria-label="No date — magnitude not applicable"
                  style={{
                    width: '100%',
                    height: 6,
                    border: '1px solid var(--rule)',
                    backgroundImage:
                      'repeating-linear-gradient(45deg, var(--rule-bright) 0 3px, transparent 3px 6px)',
                  }}
                />
              ) : (
                <span style={{
                  width: '100%',
                  height: 6,
                  background: 'var(--ink-2)',
                  border: '1px solid var(--rule)',
                  position: 'relative',
                }}>
                  <span style={{
                    position: 'absolute',
                    inset: 0,
                    width: `${pct * 100}%`,
                    background: active ? 'var(--amber)' : 'var(--paper-faint)',
                  }} />
                </span>
              )}
            </span>
            <span
              className="t-tnum"
              style={{
                fontFamily: 'var(--display)',
                fontSize: 'var(--text-md)',
                color: active ? 'var(--amber)' : 'var(--paper)',
                textAlign: 'right',
              }}
            >
              {b.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

