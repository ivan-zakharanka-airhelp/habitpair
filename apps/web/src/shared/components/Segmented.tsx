type SegmentedOption<T extends string> = T | { value: T; label: string; disabled?: boolean };

interface SegmentedProps<T extends string> {
  value: T;
  options: ReadonlyArray<SegmentedOption<T>>;
  onChange: (value: T) => void;
  ariaLabel?: string;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: SegmentedProps<T>) {
  return (
    <div className="seg" role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const v = typeof option === 'object' ? option.value : option;
        const label = typeof option === 'object' ? option.label : option;
        const disabled = typeof option === 'object' ? Boolean(option.disabled) : false;
        return (
          <button
            key={v}
            type="button"
            className="seg__btn"
            aria-pressed={v === value}
            disabled={disabled}
            onClick={() => {
              if (!disabled) onChange(v);
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
