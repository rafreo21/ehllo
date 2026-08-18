"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 as TrashIcon } from "react-feather";

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

  function clear() {
    clearWebLocalData();
    window.localStorage.removeItem("ehllo-local-owner-v1");
    setHeld(0);
    setCleared(true);
    // Reload rather than just re-render: the screens above this one were built from
    // the copy we just deleted, so leaving them mounted shows data that no longer
    // exists anywhere.
    window.setTimeout(() => router.refresh(), 400);
  }

  return (
    <section className="settings-panel">
      <header>
        <div>
          <h2>Local data</h2>
          <p>What this browser is holding on to. Your account and everything on the server are untouched.</p>
        </div>
      </header>

      <p className="settings-note">
        {held > 0
          ? `${held} of ${WEB_LOCAL_DATA_KEYS.length} stores have something saved in this browser.`
          : "Nothing is saved in this browser right now."}
      </p>

      <p className="settings-note">
        Clearing is safe: everything here is a copy kept for speed, and the next page load
        fetches it again. Your device and notification permission are left alone.
      </p>

      <button type="button" className="button button-secondary" onClick={clear} disabled={held === 0}>
        <TrashIcon size={16} />
        {cleared ? "Cleared" : "Clear this browser's copy"}
      </button>
    </section>
  );
}
