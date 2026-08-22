"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle as CheckCircleIcon, HardDrive as StorageIcon } from "react-feather";

import { useAppShellChrome } from "../../../components/AppShellChromeContext";
import { WEB_LOCAL_DATA_KEYS, clearWebLocalData } from "../../../../lib/web-local-data";

/**
 * Clears this browser's copy of your data.
 *
 * The web keeps cards, contacts and meetings in the browser so screens render
 * instantly. That copy is now cleared automatically when a different account signs
 * in, but nothing cleared it for the *same* account - so a reset on the server left
 * the browser still holding what came before, and the only way out was a console
 * snippet. This is that, as a button.
 *
 * Nothing here is destructive to the account: every key is a local cache, and the
 * next load pulls the truth back from the server.
 */
export default function LocalDataSettingsPage() {
  const router = useRouter();
  const [held, setHeld] = useState(0);
  const [cleared, setCleared] = useState(false);

  useAppShellChrome({ backHref: "/app/settings", backLabel: "Settings" });

  useEffect(() => {
    void Promise.resolve().then(() => {
      setHeld(WEB_LOCAL_DATA_KEYS.filter((key) => window.localStorage.getItem(key) !== null).length);
    });
  }, []);

  const clear = useCallback(() => {
    if (held === 0) return;
    clearWebLocalData();
    window.localStorage.removeItem("ehllo-local-owner-v1");
    setHeld(0);
    setCleared(true);
    // Reload rather than just re-render: the screens above this one were built from
    // the copy we just deleted, so leaving them mounted shows data that no longer
    // exists anywhere.
    window.setTimeout(() => router.refresh(), 400);
  }, [held, router]);

  useEffect(() => {
    function clearFromDrawer() {
      clear();
    }
    window.addEventListener("ehllo:clear-local-data", clearFromDrawer);
    return () => window.removeEventListener("ehllo:clear-local-data", clearFromDrawer);
  }, [clear]);

  return (
    <section className="settings-panel local-data-panel">
      <header>
        <div>
          <h2>Local data</h2>
          <p>What this browser is holding on to. Your account and everything on the server are untouched.</p>
        </div>
      </header>

      <div className="local-data-summary">
        <span>{held > 0 ? <StorageIcon size={19} /> : <CheckCircleIcon size={19} />}</span>
        <div>
          <strong>{held > 0 ? `${held} browser stores in use` : "Browser storage is clear"}</strong>
          <small>{held > 0 ? `${held} of ${WEB_LOCAL_DATA_KEYS.length} local stores contain cached data.` : "No cached ehllo data is stored here."}</small>
        </div>
      </div>

      <p className="local-data-explainer">Clearing removes only this browser&rsquo;s cached copy. Your account, server data, device settings, and notification permission stay unchanged.</p>

      {cleared ? <p className="local-data-cleared"><CheckCircleIcon size={16} />Browser copy cleared</p> : null}
    </section>
  );
}
