import { Icon } from '../../../shared/components/Icon';
import type { HabitListItem, Modality } from '../types';
import { HabitCard } from './HabitCard';

interface SectionProps {
  kind: Modality;
  habits: HabitListItem[];
  onAdd: () => void;
}

// A modality group (Building / Breaking) over a stack of cards. Renders nothing
// when the group is empty, so the dashboard collapses to whichever modes exist.
export function Section({ kind, habits, onAdd }: SectionProps) {
  if (!habits.length) return null;
  const pos = kind === 'POSITIVE';
  return (
    <section className="sect">
      <div className="sect__head">
        <span className={`sect__dot sect__dot--${pos ? 'pos' : 'neg'}`} />
        <span className="sect__name">{pos ? 'Building' : 'Breaking'}</span>
        <span className="sect__count">{habits.length}</span>
        <span className="sect__line" />
        <button
          type="button"
          className="sect__add"
          onClick={onAdd}
          aria-label={`Add a ${pos ? 'building' : 'breaking'} habit`}
        >
          <Icon name="plus" size={14} /> New
        </button>
      </div>
      <div className="cards">
        {habits.map((h) => (
          <HabitCard key={h.id} habit={h} />
        ))}
      </div>
    </section>
  );
}
