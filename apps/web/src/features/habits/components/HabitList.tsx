import { useHabits } from '../hooks/useHabits';
import { CreateHabitForm } from './CreateHabitForm';
import { HabitRow } from './HabitRow';
import type { HabitListItem } from '../types';

function ModalityGroup({ title, habits }: { title: string; habits: HabitListItem[] }) {
  if (habits.length === 0) return null;
  return (
    <section className="mt-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      <ul className="mt-3 flex flex-col gap-2">
        {habits.map((habit) => (
          <HabitRow key={habit.id} habit={habit} />
        ))}
      </ul>
    </section>
  );
}

export function HabitList() {
  const query = useHabits();

  if (query.isPending) {
    return <p className="mt-6 text-gray-600">Loading your habits…</p>;
  }
  if (query.isError) {
    return (
      <p role="alert" className="mt-6 text-sm text-red-600">
        {query.error.message}
      </p>
    );
  }

  const habits = query.data;

  if (habits.length === 0) {
    return (
      <div>
        <p className="mt-6 text-gray-600">No habits yet — create your first one to get started.</p>
        <CreateHabitForm />
      </div>
    );
  }

  return (
    <div>
      <ModalityGroup title="Building" habits={habits.filter((h) => h.modality === 'POSITIVE')} />
      <ModalityGroup title="Breaking" habits={habits.filter((h) => h.modality === 'NEGATIVE')} />
      <CreateHabitForm />
    </div>
  );
}
