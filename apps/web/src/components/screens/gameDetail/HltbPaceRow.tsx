/**
 * GD-PR3 — HLTB user-vs-community pace row (OQ-GD-5).
 *
 * Renders inside the PROGRESS receipt block as a single scannable line:
 *   pace: your 47h vs main 38h (+24%)
 *
 * Colour coding:
 *   green when pct < 100  — ahead of the community average
 *   amber when 100–129    — tracking near-average
 *   red   when ≥ 130      — well past the average (replays / completionist)
 *
 * Hidden when either side of the comparison is missing (no playtime
 * yet, no HLTB main story data, etc.).
 */

interface Props {
  /** User's total playtime across all platforms (minutes). */
  userMinutes: number;
  /** HLTB main story (seconds — caller passes the raw HltbData value). */
  hltbMainSeconds: number | null;
}

function fmtHours(min: number): string {
  if (min < 60) return `${min}m`;
  return `${Math.round(min / 60)}h`;
}

export function HltbPaceRow({ userMinutes, hltbMainSeconds }: Props) {
  if (userMinutes <= 0 || !hltbMainSeconds || hltbMainSeconds <= 0) return null;

  const hltbMinutes = hltbMainSeconds / 60;
  const pct = Math.round((userMinutes / hltbMinutes) * 100);
  const delta = pct - 100;
  const color = pct < 100 ? 'var(--green)' : pct < 130 ? 'var(--amber)' : 'var(--red)';

  return (
    <div className="t-mono" style={{ fontSize: 'var(--text-xs)', color: 'var(--paper-dim)', display: 'flex', alignItems: 'baseline', gap: 4, flexWrap: 'wrap' }}>
      <span>pace: your <span style={{ color: 'var(--paper)' }}>{fmtHours(userMinutes)}</span></span>
      <span>vs main <span style={{ color: 'var(--paper)' }}>{fmtHours(hltbMinutes)}</span></span>
      <span style={{ color }}>({delta >= 0 ? '+' : ''}{delta}%)</span>
    </div>
  );
}
