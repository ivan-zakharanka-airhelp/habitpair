import { createFileRoute } from '@tanstack/react-router';
import { Dashboard } from '../../features/habits/components/Dashboard';

export const Route = createFileRoute('/_authed/app')({
  component: Dashboard,
});
