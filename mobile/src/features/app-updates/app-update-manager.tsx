import * as Updates from 'expo-updates';
import { useEffect } from 'react';

/**
 * Checks for, downloads, and applies a newer OTA update on launch - without
 * this, expo-updates' default behavior only downloads in the background and
 * needs a second cold start before it's actually running, which reads as
 * "the update never arrived."
 */
export function AppUpdateManager() {
  useEffect(() => {
    if (!Updates.isEnabled) return;
    void (async () => {
      try {
        const result = await Updates.checkForUpdateAsync();
        if (!result.isAvailable) return;
        await Updates.fetchUpdateAsync();
        await Updates.reloadAsync();
      } catch {
        // No network, no update server reachable, etc. - keep running the
        // current bundle rather than blocking startup on this.
      }
    })();
  }, []);

  return null;
}
