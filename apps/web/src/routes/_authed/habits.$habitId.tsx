import { createFileRoute } from '@tanstack/react-router';
import { HabitDetail } from '../../features/habits/components/HabitDetail';

// Auth is enforced by the parent `_authed` layout's beforeLoad — this route just
// wires the param to the feature component.
export const Route = createFileRoute('/_authed/habits/$habitId')({
  component: HabitDetailRoute,
});

function HabitDetailRoute() {
  const { habitId } = Route.useParams();
  return <HabitDetail habitId={habitId} />;
}
