import { Icon } from '../../../shared/components/Icon';

interface RingProps {
  value: number;
  total: number;
  size?: number;
  stroke?: number;
}

// Progress ring: an SVG arc whose sweep is value/total, swapping to the success
// color + check glyph once the goal is met. Reused on the detail metrics strip.
export function Ring({ value, total, size = 66, stroke = 6 }: RingProps) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = total > 0 ? Math.min(1, value / total) : 0;
  const full = total > 0 && value >= total;
  return (
    <div className={`pring${full ? ' pring--full' : ''}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle className="pring__track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        <circle
          className="pring__fill"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct)}
        />
      </svg>
      {full ? (
        <div className="pring__txt">
          <Icon name="check" size={Math.round(size * 0.34)} className="pring__check" />
        </div>
      ) : null}
    </div>
  );
}
