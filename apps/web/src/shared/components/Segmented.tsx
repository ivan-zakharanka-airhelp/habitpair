import { useRef } from 'react';
import type { KeyboardEvent } from 'react';

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
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const items = options.map((option) =>
    typeof option === 'object'
      ? { value: option.value, label: option.label, disabled: Boolean(option.disabled) }
      : { value: option, label: option, disabled: false },
  );

  // Roving tabindex per the radiogroup pattern: only the checked radio (or the
  // first enabled one when none is checked) is in the tab order; arrows move
  // selection within the group.
  const enabled = items.flatMap((item, i) => (item.disabled ? [] : [i]));
  const checkedIdx = items.findIndex((item) => item.value === value && !item.disabled);
  const tabbableIdx = checkedIdx >= 0 ? checkedIdx : (enabled[0] ?? -1);

  function selectAt(index: number) {
    const item = items[index];
    if (!item || item.disabled) return;
    refs.current[index]?.focus();
    onChange(item.value);
  }

  function handleKeyDown(event: KeyboardEvent, current: number) {
    const pos = enabled.indexOf(current);
    if (pos === -1) return;
    let next: number | undefined;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = enabled[(pos + 1) % enabled.length];
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = enabled[(pos - 1 + enabled.length) % enabled.length];
        break;
      case 'Home':
        next = enabled[0];
        break;
      case 'End':
        next = enabled[enabled.length - 1];
        break;
      default:
        return;
    }
    event.preventDefault();
    if (next !== undefined) selectAt(next);
  }

  return (
    <div className="seg" role="radiogroup" aria-label={ariaLabel}>
      {items.map((item, i) => (
        <button
          key={item.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          className="seg__btn"
          aria-checked={item.value === value}
          disabled={item.disabled}
          tabIndex={i === tabbableIdx ? 0 : -1}
          onClick={() => {
            if (!item.disabled) onChange(item.value);
          }}
          onKeyDown={(event) => handleKeyDown(event, i)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
