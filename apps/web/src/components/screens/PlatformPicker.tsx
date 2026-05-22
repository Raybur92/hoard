// F1-PR1 platform picker. Two-stage IGDB-aware picker per
// INTERACTION_FLOW §3.1 + SURFACE.md §4.
//
// Inline expansion within the AddGameModal — the picker is collapsed
// to a single-line field by default; tapping the field expands it
// in-place to reveal Stage-1 bucket tabs + Stage-2 list with three
// pin sections. Selecting a platform collapses the picker back to the
// field with the chosen label locked in.
//
// Backend always receives `platformLabel: string` — the canonical
// Hoard label for curated entries, or the user's free-text input for
// freeform entries (OQ-F1-8 escape hatch).

import { useState, useMemo, useEffect, useRef } from 'react';
import {
  bucketOptions,
  suggestedFromIgdbPlatforms,
  preferredBucketFromIgdb,
  findByLabel,
  type PlatformBucket,
  type PlatformOption,
} from '../../lib/platformBuckets';
import { getRecent } from '../../lib/recentPlatforms';

interface Props {
  value: string | null;
  onChange: (label: string) => void;
  /** IGDB-reported platforms for the currently selected game (drives the suggested pin section + bucket pre-open). */
  igdbPlatforms: string[];
  disabled?: boolean;
}

const BUCKET_LABELS: Record<PlatformBucket, string> = {
  digital: 'digital',
  physical: 'physical',
  retro: 'retro',
};

export function PlatformPicker({ value, onChange, igdbPlatforms, disabled }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [activeBucket, setActiveBucket] = useState<PlatformBucket>(() =>
    preferredBucketFromIgdb(igdbPlatforms),
  );
  const [filterQuery, setFilterQuery] = useState('');
  const [freeformOpen, setFreeformOpen] = useState(false);
  const [freeformValue, setFreeformValue] = useState('');
  const filterInputRef = useRef<HTMLInputElement | null>(null);
  const freeformInputRef = useRef<HTMLInputElement | null>(null);

  // Re-pre-open the IGDB-suggested bucket when the game changes (different
  // IGDB result selected → potentially different platforms). We only do this
  // when the picker is collapsed; if the user is actively browsing, don't
  // yank them out of their chosen bucket.
  useEffect(() => {
    if (!expanded) {
      setActiveBucket(preferredBucketFromIgdb(igdbPlatforms));
    }
  }, [igdbPlatforms, expanded]);

  // Focus the filter input when picker expands.
  useEffect(() => {
    if (expanded) {
      // microtask delay so the input is in the DOM
      const id = window.setTimeout(() => filterInputRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [expanded]);

  const suggested = useMemo(() => suggestedFromIgdbPlatforms(igdbPlatforms), [igdbPlatforms]);
  const recent = useMemo(() => {
    const labels = getRecent();
    // Resolve each recent label to a PlatformOption if it's still in our enum;
    // freeform labels (not in PLATFORM_OPTIONS) are surfaced as ad-hoc entries
    // with the bucket inferred from the active context.
    return labels.map((label) => findByLabel(label) ?? null).filter((x): x is PlatformOption => x !== null);
  }, []);

  // Stage-2 content: filtered by active bucket + filter query.
  // Suggested + recent show only when matching the active bucket (so
  // jumping buckets doesn't keep showing stale game-suggested entries).
  const visibleSuggested = useMemo(() => {
    return suggested.filter((opt) => opt.bucket === activeBucket && opt.label.toLowerCase().includes(filterQuery.toLowerCase()));
  }, [suggested, activeBucket, filterQuery]);

  const visibleRecent = useMemo(() => {
    const suggestedSet = new Set(visibleSuggested.map((o) => o.label));
    return recent.filter((opt) =>
      opt.bucket === activeBucket
      && opt.label.toLowerCase().includes(filterQuery.toLowerCase())
      && !suggestedSet.has(opt.label),
    );
  }, [recent, activeBucket, filterQuery, visibleSuggested]);

  const visibleAll = useMemo(() => {
    const pinnedSet = new Set([
      ...visibleSuggested.map((o) => o.label),
      ...visibleRecent.map((o) => o.label),
    ]);
    return bucketOptions(activeBucket).filter((opt) =>
      opt.label.toLowerCase().includes(filterQuery.toLowerCase()) && !pinnedSet.has(opt.label),
    );
  }, [activeBucket, filterQuery, visibleSuggested, visibleRecent]);

  function pickPlatform(label: string): void {
    onChange(label);
    setExpanded(false);
    setFilterQuery('');
    setFreeformOpen(false);
    setFreeformValue('');
  }

  function commitFreeform(): void {
    const trimmed = freeformValue.trim();
    if (!trimmed) return;
    pickPlatform(trimmed);
  }

  // Collapsed state — single-line field showing the selected value (or
  // placeholder).
  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => !disabled && setExpanded(true)}
        disabled={disabled}
        className="field"
        aria-haspopup="listbox"
        aria-expanded={false}
        style={{
          width: '100%',
          textAlign: 'left',
          fontFamily: 'var(--mono)',
          fontSize: 'var(--text-xs)',
          color: value ? 'var(--paper)' : 'var(--paper-dim)',
          cursor: disabled ? 'default' : 'pointer',
          background: 'var(--ink-2)',
          border: '1px solid var(--rule-bright)',
          padding: '6px 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span>{value ?? 'pick a platform…'}</span>
        <span style={{ color: 'var(--paper-dim)', fontSize: 'var(--text-3xs)' }}>▾</span>
      </button>
    );
  }

  // Expanded state — Stage-1 tabs + filter + Stage-2 pin sections + freeform.
  return (
    <div
      role="dialog"
      aria-label="Platform picker"
      style={{
        border: '1px solid var(--rule-bright)',
        background: 'var(--ink-2)',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: 360,
      }}
    >
      {/* Stage 1: bucket tabs */}
      <div role="tablist" aria-label="Platform category" style={{ display: 'flex', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--rule)' }}>
        {(Object.keys(BUCKET_LABELS) as PlatformBucket[]).map((b) => {
          const active = b === activeBucket;
          return (
            <button
              key={b}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveBucket(b)}
              className="t-mono"
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: active ? '2px solid var(--amber)' : '2px solid transparent',
                color: active ? 'var(--paper)' : 'var(--paper-dim)',
                fontSize: 'var(--text-xs)',
                padding: '4px 6px',
                marginBottom: -1,
                cursor: 'pointer',
                textTransform: 'none',
              }}
            >
              {BUCKET_LABELS[b]}
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="t-mono"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--paper-dim)',
            fontSize: 'var(--text-2xs)',
            cursor: 'pointer',
            padding: '4px 6px',
          }}
          aria-label="Close picker"
        >
          ×
        </button>
      </div>

      {/* Filter input */}
      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--rule)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span aria-hidden="true" className="t-faint" style={{ fontFamily: 'var(--mono)', fontSize: 'var(--text-xs)' }}>$</span>
          <input
            ref={filterInputRef}
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="filter platforms…"
            aria-label="Filter platforms"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontFamily: 'var(--mono)',
              fontSize: 'var(--text-xs)',
              color: 'var(--paper)',
            }}
          />
        </div>
      </div>

      {/* Stage-2 list — scrollable */}
      <div role="listbox" aria-label="Platforms" className="thin-scroll" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {visibleSuggested.length > 0 && (
          <PinSection label="// suggested for this game">
            {visibleSuggested.map((opt) => <PickerRow key={opt.label} opt={opt} onPick={pickPlatform} />)}
          </PinSection>
        )}

        {visibleRecent.length > 0 && (
          <PinSection label="// recently used">
            {visibleRecent.map((opt) => <PickerRow key={opt.label} opt={opt} onPick={pickPlatform} />)}
          </PinSection>
        )}

        {visibleAll.length > 0 && (
          <PinSection label="// all">
            {visibleAll.map((opt) => <PickerRow key={opt.label} opt={opt} onPick={pickPlatform} />)}
          </PinSection>
        )}

        {visibleSuggested.length === 0 && visibleRecent.length === 0 && visibleAll.length === 0 && (
          <div style={{ padding: '14px 12px', color: 'var(--paper-dim)', fontSize: 'var(--text-2xs)' }}>
            no platforms match &quot;{filterQuery}&quot; in {BUCKET_LABELS[activeBucket]}
          </div>
        )}
      </div>

      {/* Freeform escape hatch — pinned at the bottom regardless of filter */}
      <div style={{ borderTop: '1px solid var(--rule)', padding: '8px 10px' }}>
        {!freeformOpen ? (
          <button
            type="button"
            onClick={() => {
              setFreeformOpen(true);
              window.setTimeout(() => freeformInputRef.current?.focus(), 0);
            }}
            className="t-mono"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--paper-dim)',
              fontSize: 'var(--text-2xs)',
              cursor: 'pointer',
              padding: '4px 0',
              width: '100%',
              textAlign: 'left',
            }}
          >
            [ + other / freeform platform ]
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span aria-hidden="true" className="t-faint" style={{ fontFamily: 'var(--mono)', fontSize: 'var(--text-xs)' }}>$</span>
            <input
              ref={freeformInputRef}
              value={freeformValue}
              onChange={(e) => setFreeformValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitFreeform();
                if (e.key === 'Escape') { setFreeformOpen(false); setFreeformValue(''); }
              }}
              placeholder="type a platform name…"
              aria-label="Freeform platform name"
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontFamily: 'var(--mono)',
                fontSize: 'var(--text-xs)',
                color: 'var(--paper)',
                borderBottom: '1px solid var(--rule-bright)',
                padding: '2px 0',
              }}
            />
            <button
              type="button"
              onClick={commitFreeform}
              disabled={!freeformValue.trim()}
              className="t-mono"
              style={{
                background: 'transparent',
                border: 'none',
                color: freeformValue.trim() ? 'var(--amber)' : 'var(--paper-faint)',
                fontSize: 'var(--text-2xs)',
                cursor: freeformValue.trim() ? 'pointer' : 'default',
                padding: '4px 6px',
              }}
            >
              [use this name]
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PinSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="t-mono t-faint" style={{ fontSize: 'var(--text-3xs)', padding: '8px 12px 4px 12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function PickerRow({ opt, onPick }: { opt: PlatformOption; onPick: (label: string) => void }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={false}
      onClick={() => onPick(opt.label)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        background: 'transparent',
        border: 'none',
        borderTop: 'none',
        borderBottom: '1px solid var(--rule)',
        cursor: 'pointer',
        width: '100%',
        textAlign: 'left',
        font: 'inherit',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--ink)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span className="plat" style={{ width: 32, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {opt.code}
      </span>
      <span className="t-mono" style={{ fontSize: 'var(--text-xs)', color: 'var(--paper)' }}>{opt.label}</span>
    </button>
  );
}
