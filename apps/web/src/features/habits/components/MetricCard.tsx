import { Icon, type IconName } from '../../../shared/components/Icon';
import { StatRing, type RingTone } from './StatRing';

interface MetricCardProps {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  ico: IconName;
  // Omit for a ring-less card (current streak); pass a number|null to show the
  // ring (null = no closed period yet → empty arc).
  ringPct?: number | null;
  tone?: RingTone;
}

export function MetricCard({ label, value, unit, sub, ico, ringPct, tone }: MetricCardProps) {
  return (
    <div className="statcard">
      <div className="statcard__top">
        <span className={`statcard__chip${tone === 'success' ? ' statcard__chip--success' : ''}`}>
          <Icon name={ico} size={15} />
        </span>
        <span className="statcard__label">{label}</span>
      </div>
      <div className="statcard__body">
        <div className="statcard__val">
          {value}
          {unit ? <span className="u">{unit}</span> : null}
        </div>
        {ringPct !== undefined ? <StatRing pct={ringPct} tone={tone} /> : null}
      </div>
      {sub ? <div className="statcard__sub">{sub}</div> : null}
    </div>
  );
}
