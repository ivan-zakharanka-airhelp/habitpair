import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../../shared/components/Icon';

interface HabitActionsMenuProps {
  onEdit: () => void;
  onDelete: () => void;
}

// The detail-header kebab: Edit + danger Delete. Mirrors AccountMenu's
// outside-click + Escape close, and reuses the `.acct__menu` popover styling.
export function HabitActionsMenu({ onEdit, onDelete }: HabitActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="hmenu" ref={ref}>
      <button
        type="button"
        className="hmenu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Habit actions"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="hmenu__dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </button>
      {open ? (
        <div className="acct__menu" role="menu" style={{ width: 190 }}>
          <button
            type="button"
            className="acct__item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
          >
            <Icon name="edit" size={16} /> Edit habit
          </button>
          <div className="acct__sep" />
          <button
            type="button"
            className="acct__item acct__item--danger"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          >
            <Icon name="trash" size={16} /> Delete habit
          </button>
        </div>
      ) : null}
    </div>
  );
}
