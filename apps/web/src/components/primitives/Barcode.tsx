export interface BarcodeProps {
  code?: string;
  height?: number;
}

export function Barcode({ code = 'HRD-0042-ELDN-0026', height = 36 }: BarcodeProps) {
  const widths: number[] = [];
  let seed = 5;
  for (let i = 0; i < 80; i++) {
    seed = (seed * 9301 + 49297) % 233280;
    widths.push(1 + Math.floor((seed / 233280) * 3));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div className="barcode" style={{ height }}>
        {widths.map((w, i) =>
          i % 2 === 0
            ? <div key={i} className="bar" style={{ width: w }} />
            : <div key={i} style={{ width: w }} />,
        )}
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: "var(--text-3xs)", letterSpacing: '0.18em' }}>{code}</div>
    </div>
  );
}
