import { useSyncExternalStore } from 'react';
import { pwaInstall } from '../lib/pwaInstall';
import { toast } from '../lib/toast';

// Renders the install affordance: a native-prompt button where the browser
// supports `beforeinstallprompt`, an "Add to Home Screen" hint on iOS Safari
// (where that event never fires), and nothing once installed or unsupported.
export function InstallButton() {
  const { canInstall, isStandalone, isIOS } = useSyncExternalStore(
    pwaInstall.subscribe,
    pwaInstall.getSnapshot,
  );

  if (isStandalone) return null;

  if (canInstall) {
    return (
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        onClick={() => void pwaInstall.promptInstall()}
      >
        Install
      </button>
    );
  }

  if (isIOS) {
    return (
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        onClick={() => toast("Tap the Share icon, then 'Add to Home Screen'.", 6000)}
      >
        Install
      </button>
    );
  }

  return null;
}
