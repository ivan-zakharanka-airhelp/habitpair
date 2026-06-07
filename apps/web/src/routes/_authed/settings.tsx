import { createFileRoute } from '@tanstack/react-router';
import { SettingsScreen } from '../../features/settings/components/SettingsScreen';

// Auth is enforced by the parent `_authed` layout's beforeLoad.
export const Route = createFileRoute('/_authed/settings')({
  component: SettingsScreen,
});
