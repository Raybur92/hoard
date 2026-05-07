import { Icon } from '../../primitives/Icon';

export interface MobileViewHeaderProps {
  /** Tappable label that opens the view sheet — e.g. "wishlist · may 2026 ▾". */
  label: string;
  /** Optional caption under the label, e.g. "// 3 starred · next in 14d". */
  sub?: string | undefined;
  /** Tap handler for the label (opens the sheet). */
  onLabelTap: () => void;
  /** Step to the previous bucket in the active zoom. No-op when prevDisabled. */
  onPrev: () => void;
  /** Step to the next bucket in the active zoom. No-op when nextDisabled. */
  onNext: () => void;
  prevDisabled: boolean;
  nextDisabled: boolean;
}

/**
 * Mobile header for the Releases page (R5 of RELEASES_PLAN.md).
 *
 * Layout per handoff §3 + §8:
 *   [‹ prev]   [tappable view label ▾]   [› next]
 *                  [optional sub line]
 *
 * The chevrons step adjacent buckets in the current zoom *without* opening
 * the sheet. They disable at the extremes (no wrap-around — handoff §8).
 *
 * Disabled state per §8 + §12 punch-list 10: `opacity 0.35`, paper-faint,
 * non-interactive cursor, AND the actual `disabled` attribute set so screen
 * readers and keyboard nav behave correctly.
 *
 * Used on the main Releases mobile screens. The RECENT mobile surface uses
 * the existing `MobileHeader` instead — no view label, just back arrow + title.
 */
export function MobileViewHeader({
  label,
  sub,
  onLabelTap,
  onPrev,
  onNext,
  prevDisabled,
  nextDisabled,
}: MobileViewHeaderProps) {
  return (
    <div
      className="m-view-header"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '14px 16px 10px',
        borderBottom: '1px solid var(--rule)',
      }}
    >
      <ChevronBtn
        dir="prev"
        disabled={prevDisabled}
        onClick={onPrev}
        ariaLabel="Previous bucket"
      />

      <button
        type="button"
        onClick={onLabelTap}
        aria-haspopup="dialog"
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
          padding: '6px 8px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'inherit',
          color: 'inherit',
        }}
      >
        <span
          className="t-mono"
          style={{
            fontSize: 'var(--text-xs)',
            letterSpacing: '0.06em',
            color: 'var(--paper)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
          <Icon name="caret" size={12} />
        </span>
        {sub && (
          <span
            className="t-faint"
            style={{ fontSize: 'var(--text-3xs)', letterSpacing: '0.04em' }}
          >
            {sub}
          </span>
        )}
      </button>

      <ChevronBtn
        dir="next"
        disabled={nextDisabled}
        onClick={onNext}
        ariaLabel="Next bucket"
      />
    </div>
  );
}

function ChevronBtn({
  dir,
  disabled,
  onClick,
  ariaLabel,
}: {
  dir: 'prev' | 'next';
  disabled: boolean;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      style={{
        width: 36,
        height: 36,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        border: '1px solid var(--rule)',
        color: disabled ? 'var(--paper-faint)' : 'var(--paper)',
        opacity: disabled ? 0.35 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transform: dir === 'next' ? 'scaleX(-1)' : undefined,
      }}
    >
      <Icon name="back" size={14} />
    </button>
  );
}
