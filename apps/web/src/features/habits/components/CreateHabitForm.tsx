import { useState, type CSSProperties, type FormEvent } from 'react';
import { Button } from '../../../shared/components/Button';
import { Dialog } from '../../../shared/components/Dialog';
import { Field } from '../../../shared/components/Field';
import { Input } from '../../../shared/components/Input';
import { Segmented } from '../../../shared/components/Segmented';
import { toast } from '../../../shared/lib/toast';
import { useCreateHabit } from '../hooks/useCreateHabit';
import type { Frequency, Modality } from '../types';

interface CreateHabitFormProps {
  onClose: () => void;
  initialModality?: Modality;
}

const formStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 18 };

// The create flow as a modal. Mounted only while open (the parent remounts it on
// each open), so state initializers give a clean form every time — no reset
// effect. Modality is seeded by whichever section's "New" opened it; daily
// habits omit targetCount (the backend forces it null).
export function CreateHabitForm({ onClose, initialModality = 'POSITIVE' }: CreateHabitFormProps) {
  const createHabit = useCreateHabit();
  const [name, setName] = useState('');
  const [modality, setModality] = useState<Modality>(initialModality);
  const [frequency, setFrequency] = useState<Frequency>('DAILY');
  const [target, setTarget] = useState(2);

  const trimmed = name.trim();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!trimmed) return;
    createHabit.mutate(
      {
        name: trimmed,
        modality,
        frequency,
        ...(frequency !== 'DAILY' ? { targetCount: target } : {}),
      },
      {
        onSuccess: () => {
          toast(`“${trimmed}” added.`);
          onClose();
        },
      },
    );
  };

  return (
    <Dialog
      open
      title="Add a habit"
      onCancel={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="create-habit-form"
            disabled={createHabit.isPending || !trimmed}
          >
            {createHabit.isPending ? 'Adding…' : 'Add habit'}
          </Button>
        </>
      }
    >
      <form id="create-habit-form" style={formStyle} onSubmit={submit}>
        <Field label="Name">
          <Input
            value={name}
            autoFocus
            placeholder="e.g. Meditate, No phone in bed…"
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <div className="field">
          <span className="label">Type</span>
          <Segmented
            value={modality}
            onChange={setModality}
            ariaLabel="Type"
            options={[
              { value: 'POSITIVE', label: 'Build' },
              { value: 'NEGATIVE', label: 'Break' },
            ]}
          />
        </div>
        <div className="field">
          <span className="label">Frequency</span>
          <Segmented
            value={frequency}
            onChange={setFrequency}
            ariaLabel="Frequency"
            options={[
              { value: 'DAILY', label: 'Daily' },
              { value: 'WEEKLY', label: 'Weekly' },
              { value: 'MONTHLY', label: 'Monthly' },
            ]}
          />
        </div>
        {frequency !== 'DAILY' ? (
          <div style={{ maxWidth: 160 }}>
            <Field label={`Times per ${frequency === 'WEEKLY' ? 'week' : 'month'}`}>
              <Input
                type="number"
                min={1}
                max={frequency === 'WEEKLY' ? 7 : 31}
                value={target}
                onChange={(e) => setTarget(Math.max(1, Number(e.target.value) || 1))}
              />
            </Field>
          </div>
        ) : null}
        {createHabit.isError ? (
          <div className="field__err" role="alert">
            {createHabit.error.message}
          </div>
        ) : null}
      </form>
    </Dialog>
  );
}
