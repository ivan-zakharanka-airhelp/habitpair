import { useState } from 'react';
import { useCreateHabit } from '../hooks/useCreateHabit';
import type { Frequency, Modality } from '../types';

export function CreateHabitForm() {
  const createHabit = useCreateHabit();
  const [name, setName] = useState('');
  const [modality, setModality] = useState<Modality>('POSITIVE');
  const [frequency, setFrequency] = useState<Frequency>('DAILY');
  const [targetCount, setTargetCount] = useState(2);

  const needsTarget = frequency !== 'DAILY';

  return (
    <form
      className="mt-6 flex max-w-sm flex-col gap-3"
      aria-labelledby="create-habit-heading"
      onSubmit={(event) => {
        event.preventDefault();
        createHabit.mutate(
          { name, modality, frequency, ...(needsTarget ? { targetCount } : {}) },
          {
            onSuccess: () => {
              setName('');
              setModality('POSITIVE');
              setFrequency('DAILY');
              setTargetCount(2);
            },
          },
        );
      }}
    >
      <h2 id="create-habit-heading" className="text-lg font-semibold">
        Add a habit
      </h2>
      <label className="flex flex-col gap-1">
        Name
        <input
          type="text"
          name="name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="rounded border border-gray-300 p-2"
        />
      </label>
      <label className="flex flex-col gap-1">
        Type
        <select
          name="modality"
          value={modality}
          onChange={(event) => setModality(event.target.value as Modality)}
          className="rounded border border-gray-300 p-2"
        >
          <option value="POSITIVE">Build (positive)</option>
          <option value="NEGATIVE">Break (negative)</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        Frequency
        <select
          name="frequency"
          value={frequency}
          onChange={(event) => setFrequency(event.target.value as Frequency)}
          className="rounded border border-gray-300 p-2"
        >
          <option value="DAILY">Daily</option>
          <option value="WEEKLY">Weekly</option>
          <option value="MONTHLY">Monthly</option>
        </select>
      </label>
      {needsTarget ? (
        <label className="flex flex-col gap-1">
          Target count per {frequency === 'WEEKLY' ? 'week' : 'month'}
          <input
            type="number"
            name="targetCount"
            min={1}
            required
            value={targetCount}
            onChange={(event) => setTargetCount(Number(event.target.value))}
            className="rounded border border-gray-300 p-2"
          />
        </label>
      ) : null}
      {createHabit.isError ? (
        <p role="alert" className="text-sm text-red-600">
          {createHabit.error.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={createHabit.isPending}
        className="rounded bg-black p-2 text-white disabled:opacity-50"
      >
        Add habit
      </button>
    </form>
  );
}
