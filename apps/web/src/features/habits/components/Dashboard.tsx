import { useState } from 'react';
import { Button } from '../../../shared/components/Button';
import { Icon } from '../../../shared/components/Icon';
import { Skeleton } from '../../../shared/components/Skeleton';
import { useHabits } from '../hooks/useHabits';
import type { Modality } from '../types';
import { CreateHabitForm } from './CreateHabitForm';
import { Section } from './Section';
import { TodayHero } from './TodayHero';

// The authed home screen: today's hero + ring, then Building / Breaking sections
// of habit cards. Owns the create-modal open state so the section "New" buttons
// and the empty-state CTA can seed its modality.
export function Dashboard() {
  const query = useHabits();
  const [addOpen, setAddOpen] = useState(false);
  const [addModality, setAddModality] = useState<Modality>('POSITIVE');

  const openAdd = (modality: Modality) => {
    setAddModality(modality);
    setAddOpen(true);
  };

  if (query.isPending) {
    return (
      <main className="container page fadein">
        <div className="today">
          <div className="today__l" style={{ gap: 8 }}>
            <Skeleton w={60} h={12} />
            <Skeleton w={180} h={36} />
            <Skeleton w={110} h={16} />
          </div>
          <Skeleton w={66} h={66} r="50%" />
        </div>
        <div className="today__rule" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 18 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} w="100%" h={82} r="var(--radius)" />
          ))}
        </div>
      </main>
    );
  }

  if (query.isError) {
    return (
      <main className="container page fadein">
        <div className="form-err" style={{ marginTop: 28 }} role="alert">
          <Icon name="x" size={15} /> {query.error.message}
        </div>
      </main>
    );
  }

  const habits = query.data;

  return (
    <main className="container page fadein">
      {habits.length === 0 ? (
        <>
          <TodayHero habits={habits} />
          <div className="today__rule" />
          <div className="empty" style={{ marginTop: 24 }}>
            <Icon name="sprout" size={40} className="empty__ico" />
            <p style={{ margin: 0, fontWeight: 600, color: 'var(--ink-2)' }}>No habits yet</p>
            <p style={{ margin: '6px 0 0' }}>Create your first one, building or breaking.</p>
          </div>
          <div className="addhabit">
            <Button
              variant="soft"
              className="addhabit__btn"
              onClick={() => openAdd('POSITIVE')}
            >
              <Icon name="plus" size={18} /> Add a habit
            </Button>
          </div>
        </>
      ) : (
        <>
          <TodayHero habits={habits} />
          <div className="today__rule" />
          <Section
            kind="POSITIVE"
            habits={habits.filter((h) => h.modality === 'POSITIVE')}
            onAdd={() => openAdd('POSITIVE')}
          />
          <Section
            kind="NEGATIVE"
            habits={habits.filter((h) => h.modality === 'NEGATIVE')}
            onAdd={() => openAdd('NEGATIVE')}
          />
        </>
      )}
      <CreateHabitForm open={addOpen} onClose={() => setAddOpen(false)} initialModality={addModality} />
    </main>
  );
}
