/**
 * GD-PR4b — sigil SVG bundle for the OQ-GD-13 archivist relic surface.
 *
 * 24 unique sigil definitions, ported verbatim from the design prototype
 * at scripts/relic-composition.ts. Keyed by name so the API's
 * `SigilAssignment.sigilName` looks up directly here.
 *
 * Each value is an SVG body string (inner `<circle>` / `<rect>` / etc),
 * NOT a full `<svg>` document. The consumer wraps it in a 40×40 viewBox
 * `<svg>` at render time and inlines via dangerouslySetInnerHTML.
 *
 * Lock: 1 sigil = 1 value globally (the consecrated-symbol
 * interpretation, 2026-06-01). Reader builds vocabulary over time.
 *
 * Adding a 25th sigil requires updating both this file AND the API's
 * sigil tables (`apps/api/src/lib/relicSigils.ts`) in lockstep — the
 * frontend renders blank if it gets a sigilName from the API that
 * doesn't exist in this map.
 */

// Pre-computed SVG bodies for sigils with algorithmic geometry (star-8 /
// asterisk-6 / cluster / sunburst). Computed once at module load — same
// outputs as the prototype's IIFE generators, just statically embedded.

const star8 = ((): string => {
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const r = i % 2 === 0 ? 12 : 5;
    const a = (i * Math.PI) / 8 - Math.PI / 2;
    pts.push(`${(20 + r * Math.cos(a)).toFixed(2)},${(20 + r * Math.sin(a)).toFixed(2)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="#ece8de"/>`;
})();

const asterisk6 = ((): string => {
  let lines = '';
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 6;
    const x = 20 + 11 * Math.cos(a);
    const y = 20 + 11 * Math.sin(a);
    lines += `<line x1="${(40 - x).toFixed(2)}" y1="${(40 - y).toFixed(2)}" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}" stroke="#ece8de" stroke-width="1.5"/>`;
  }
  return lines;
})();

const cluster = ((): string => {
  let dots = '';
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      dots += `<rect x="${10 + x * 8}" y="${10 + y * 8}" width="4" height="4" fill="#ece8de"/>`;
    }
  }
  return dots;
})();

const sunburst = ((): string => {
  let lines = '';
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    const x1 = 20 + 5 * Math.cos(a);
    const y1 = 20 + 5 * Math.sin(a);
    const x2 = 20 + 13 * Math.cos(a);
    const y2 = 20 + 13 * Math.sin(a);
    lines += `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="#ece8de" stroke-width="1.4"/>`;
  }
  return lines + `<circle cx="20" cy="20" r="2" fill="#ece8de"/>`;
})();

export const SIGIL_BY_NAME: Record<string, string> = {
  // core 16
  'orb':        `<circle cx="20" cy="20" r="9" fill="#ece8de"/>`,
  'ring-dot':   `<circle cx="20" cy="20" r="10" fill="none" stroke="#ece8de" stroke-width="1.5"/><circle cx="20" cy="20" r="2.5" fill="#ece8de"/>`,
  'star-8':     star8,
  'asterisk-6': asterisk6,
  'cross':      `<rect x="9" y="18" width="22" height="4" fill="#ece8de"/><rect x="18" y="9" width="4" height="22" fill="#ece8de"/>`,
  'block':      `<rect x="10" y="10" width="20" height="20" fill="#ece8de"/>`,
  'box':        `<rect x="10" y="10" width="20" height="20" fill="none" stroke="#ece8de" stroke-width="1.5"/>`,
  'diamond':    `<polygon points="20,8 32,20 20,32 8,20" fill="#ece8de"/>`,
  'rings':      `<circle cx="20" cy="20" r="13" fill="none" stroke="#ece8de" stroke-width="1"/><circle cx="20" cy="20" r="8" fill="none" stroke="#ece8de" stroke-width="1"/><circle cx="20" cy="20" r="3" fill="#ece8de"/>`,
  'cluster':    cluster,
  'wedge':      `<polygon points="20,8 32,32 8,32" fill="#ece8de"/>`,
  'half':       `<path d="M 8 20 a 12 12 0 0 1 24 0 z" fill="#ece8de"/>`,
  'spiral':     `<path d="M 20 20 m -1 0 a 1 1 0 1 1 2 0 a 2 2 0 1 1 -4 0 a 3 3 0 1 1 6 0 a 4 4 0 1 1 -8 0 a 6 6 0 1 1 12 0" fill="none" stroke="#ece8de" stroke-width="1.4"/>`,
  'ladder':     `<rect x="10" y="11" width="20" height="2.5" fill="#ece8de"/><rect x="10" y="18.75" width="20" height="2.5" fill="#ece8de"/><rect x="10" y="26.5" width="20" height="2.5" fill="#ece8de"/>`,
  'sunburst':   sunburst,
  'target':     `<circle cx="20" cy="20" r="12" fill="none" stroke="#ece8de" stroke-width="1"/><circle cx="20" cy="20" r="6" fill="none" stroke="#ece8de" stroke-width="1"/><line x1="6" y1="20" x2="34" y2="20" stroke="#ece8de" stroke-width="0.8"/><line x1="20" y1="6" x2="20" y2="34" stroke="#ece8de" stroke-width="0.8"/>`,
  // 8 new (2026-06-01)
  'wave':       `<path d="M 6 20 q 4 -8 8 0 t 8 0 t 8 0 t 8 0" fill="none" stroke="#ece8de" stroke-width="1.6"/>`,
  'flame':      `<path d="M 20 8 q -6 6 -4 14 q -2 4 4 10 q 6 -6 4 -10 q 2 -8 -4 -14 z" fill="#ece8de"/>`,
  'eye':        `<path d="M 6 20 q 14 -10 28 0 q -14 10 -28 0 z" fill="none" stroke="#ece8de" stroke-width="1.4"/><circle cx="20" cy="20" r="3.5" fill="#ece8de"/>`,
  'stairs':     `<rect x="6" y="26" width="28" height="4" fill="#ece8de"/><rect x="11" y="20" width="18" height="4" fill="#ece8de"/><rect x="16" y="14" width="8" height="4" fill="#ece8de"/>`,
  'hex':        `<polygon points="20,7 31,13 31,27 20,33 9,27 9,13" fill="none" stroke="#ece8de" stroke-width="1.4"/><circle cx="20" cy="20" r="1.5" fill="#ece8de"/>`,
  'trefoil':    `<circle cx="20" cy="13" r="6" fill="none" stroke="#ece8de" stroke-width="1.4"/><circle cx="14" cy="24" r="6" fill="none" stroke="#ece8de" stroke-width="1.4"/><circle cx="26" cy="24" r="6" fill="none" stroke="#ece8de" stroke-width="1.4"/>`,
  'orbit':      `<ellipse cx="20" cy="20" rx="13" ry="5" fill="none" stroke="#ece8de" stroke-width="1.2" transform="rotate(-25 20 20)"/><circle cx="20" cy="20" r="3" fill="#ece8de"/>`,
  'cube-iso':   `<polygon points="20,8 32,15 32,28 20,35 8,28 8,15" fill="none" stroke="#ece8de" stroke-width="1.2"/><line x1="20" y1="8" x2="20" y2="35" stroke="#ece8de" stroke-width="1.2"/><line x1="8" y1="15" x2="32" y2="15" stroke="#ece8de" stroke-width="1.2"/>`,
};
