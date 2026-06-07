export type RingTone = 'accent' | 'success';

interface StatRingProps {
  pct: number | null;
  tone?: RingTone;
  size?: number;
  stroke?: number;
}

// The small metric-card ring: an SVG arc whose sweep is pct/100. Distinct from
// the dashboard's completion `Ring` (different scale + classes). A null pct
// (no closed period yet) renders an empty track.
export function StatRing({ pct, tone = 'accent', size = 44, stroke = 5 }: StatRingProps) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, (pct ?? 0) / 100));
  return (
    <div className="statring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          className="statring__track"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
        />
        <circle
          className={`statring__fill${tone === 'success' ? ' statring__fill--success' : ''}`}
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
        />
      </svg>
    </div>
  );
}
