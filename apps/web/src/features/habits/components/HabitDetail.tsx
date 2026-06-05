import { useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Button } from '../../../shared/components/Button';
import { Dialog } from '../../../shared/components/Dialog';
import { Field } from '../../../shared/components/Field';
import { Icon } from '../../../shared/components/Icon';
import { Input } from '../../../shared/components/Input';
import { Segmented } from '../../../shared/components/Segmented';
import { Skeleton } from '../../../shared/components/Skeleton';
import { toast } from '../../../shared/lib/toast';
import { useCycleMark } from '../hooks/useCycleMark';
import { useDeleteHabit } from '../hooks/useDeleteHabit';
import { useHabitCalendar } from '../hooks/useHabitCalendar';
import { useHabitMetrics } from '../hooks/useHabitMetrics';
import { useUpdateHabit } from '../hooks/useUpdateHabit';
import { calendarQueryRange, currentMonth } from '../lib/calendarRange';
import { todayLocalISO } from '../lib/today';
import type { Modality } from '../types';
import { BestStreaks } from './BestStreaks';
import { HabitActionsMenu } from './HabitActionsMenu';
import { HabitCalendar } from './HabitCalendar';
import { HabitMetrics } from './HabitMetrics';

function freqText(frequency: string, targetCount: number | null): string {
  if (frequency === 'DAILY') return 'Daily';
  return `${targetCount ?? 1}× per ${frequency === 'WEEKLY' ? 'week' : 'month'}`;
}

const formStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 18 };

function DetailSkeleton() {
  return (
    <main className="container page">
      <Skeleton w={130} h={38} r={999} />
      <div style={{ marginTop: 18 }}>
        <Skeleton w="50%" h={32} />
      </div>
      <div className="metrics">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} w="100%" h={92} r="var(--radius)" />
        ))}
      </div>
      <div style={{ marginTop: 32 }}>
        <Skeleton w="100%" h={300} r="var(--radius)" />
      </div>
    </main>
  );
}

export function HabitDetail({ habitId }: { habitId: string }) {
  const today = todayLocalISO();
  // Fetch a fixed 24-month window once; the calendar slides its display window
  // over it client-side, so month navigation never refetches. The anchor
  // (firstMarkDate) comes back with the data and only shapes the display.
  const range = calendarQueryRange('all', currentMonth());
  const query = useHabitCalendar(habitId, range.fromMonth, range.toMonth, today);
  // Bound to the same window so optimistic writes + invalidation target this key.
  const cycleMark = useCycleMark(habitId, range.fromMonth, range.toMonth, today);
  // One metrics query feeds both the strip and the best-streaks leaderboard.
  const metricsQuery = useHabitMetrics(habitId, today);

  const navigate = useNavigate();
  const updateHabit = useUpdateHabit(habitId);
  const deleteHabit = useDeleteHabit(habitId);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editName, setEditName] = useState('');
  const [editModality, setEditModality] = useState<Modality>('POSITIVE');

  if (query.isPending) return <DetailSkeleton />;
  if (query.isError) {
    return (
      <main className="container page">
        <div className="form-err" style={{ marginTop: 28 }} role="alert">
          <Icon name="x" size={15} /> {query.error.message}
        </div>
      </main>
    );
  }

  const data = query.data;
  const { habit, firstMarkDate } = data;
  const pos = habit.modality === 'POSITIVE';

  const onCycle = (iso: string) => {
    // One in-flight mutation per cell — a repeat click would cycle from a stale
    // stored status and race the pending write. Other cells stay clickable.
    if (cycleMark.isPending && cycleMark.variables?.date === iso) return;
    cycleMark.mutate({ date: iso, storedStatus: data.marks[iso] ?? null });
  };

  const submitEdit = (event: FormEvent) => {
    event.preventDefault();
    const name = editName.trim();
    if (!name) return;
    updateHabit.mutate(
      { name, modality: editModality },
      {
        onSuccess: () => {
          toast(`“${name}” updated.`);
          setEditing(false);
        },
      },
    );
  };

  return (
    <main className="container page fadein">
      <div className="detail__bar">
        <Link to="/app" className="backbtn">
          <Icon name="arrowL" size={15} /> Back to habits
        </Link>
        <HabitActionsMenu
          onEdit={() => {
            setEditName(habit.name);
            setEditModality(habit.modality);
            setEditing(true);
          }}
          onDelete={() => setConfirmingDelete(true)}
        />
      </div>

      <div className="detail__head">
        <span className="detail__meta">
          <span className={`tag__chip ${pos ? 'tag__chip--pos' : 'tag__chip--neg'}`}>
            {pos ? 'Building' : 'Breaking'}
          </span>
          <span className="detail__freq">{freqText(habit.frequency, habit.targetCount)}</span>
        </span>
        <h1 className="h1 detail__title">{habit.name}</h1>
      </div>

      {metricsQuery.data ? (
        <HabitMetrics metrics={metricsQuery.data} firstMarkDate={firstMarkDate} />
      ) : null}

      <HabitCalendar data={data} onCycle={onCycle} />

      {metricsQuery.data ? <BestStreaks metrics={metricsQuery.data} /> : null}

      <Dialog
        open={editing}
        title="Edit habit"
        onCancel={() => setEditing(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="edit-habit-form"
              disabled={updateHabit.isPending || !editName.trim()}
            >
              {updateHabit.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </>
        }
      >
        <form id="edit-habit-form" style={formStyle} onSubmit={submitEdit}>
          <Field label="Name">
            <Input value={editName} autoFocus onChange={(e) => setEditName(e.target.value)} />
          </Field>
          <div className="field">
            <span className="label">Type</span>
            <Segmented
              value={editModality}
              onChange={setEditModality}
              ariaLabel="Type"
              options={[
                { value: 'POSITIVE', label: 'Build' },
                { value: 'NEGATIVE', label: 'Break' },
              ]}
            />
          </div>
          <p className="field__hint">
            {freqText(habit.frequency, habit.targetCount)} · frequency can&rsquo;t be changed.
          </p>
          {updateHabit.isError ? (
            <div className="field__err" role="alert">
              {updateHabit.error.message}
            </div>
          ) : null}
        </form>
      </Dialog>

      <Dialog
        open={confirmingDelete}
        title="Delete habit"
        onCancel={() => setConfirmingDelete(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="danger-solid"
              disabled={deleteHabit.isPending}
              onClick={() =>
                deleteHabit.mutate(undefined, {
                  onSuccess: () => {
                    toast(`“${habit.name}” deleted.`);
                    navigate({ to: '/app' });
                  },
                })
              }
            >
              {deleteHabit.isPending ? 'Deleting…' : 'Delete habit'}
            </Button>
          </>
        }
      >
        Delete &ldquo;{habit.name}&rdquo; and all its marks? This can&rsquo;t be undone.
      </Dialog>
    </main>
  );
}
