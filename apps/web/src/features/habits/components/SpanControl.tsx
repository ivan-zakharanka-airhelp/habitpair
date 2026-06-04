import type { CalendarSpan } from '../types';

const OPTIONS: { value: CalendarSpan; label: string }[] = [
  { value: '3', label: '3 mo' },
  { value: '6', label: '6 mo' },
  { value: '12', label: '12 mo' },
  { value: 'all', label: '2 yr' },
];

interface SpanControlProps {
  value: CalendarSpan;
  onChange: (span: CalendarSpan) => void;
  // The '2 yr' ('all') span needs the first-mark anchor to bound its window;
  // disable it until the habit has a mark so the span can never resolve to none.
  allEnabled: boolean;
}

export function SpanControl({ value, onChange, allEnabled }: SpanControlProps) {
  return (
    <div
      role="group"
      aria-label="Calendar span"
      className="inline-flex overflow-hidden rounded border border-gray-300"
    >
      {OPTIONS.map((opt) => {
        const disabled = opt.value === 'all' && !allEnabled;
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={`border-l border-gray-300 px-3 py-1 text-sm first:border-l-0 disabled:opacity-40 ${
              active ? 'bg-black text-white' : 'text-gray-700'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
