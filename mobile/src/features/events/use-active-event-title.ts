import { useEffect, useState } from 'react';

import { isEventCurrentlyHappening } from '@/features/events/event-home-state';
import { fetchMyEvents } from '@/features/events/events-api';

/**
 * The title of whichever "going" event is happening right now, if any — used
 * to tag "where we met" onto vCards/QR payloads shared during that window.
 */
export function useActiveEventTitle(accessToken: string | undefined): string | undefined {
  const [activeEventTitle, setActiveEventTitle] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!accessToken) {
      setActiveEventTitle(undefined);
      return;
    }
    let cancelled = false;
    void fetchMyEvents(accessToken, { allowCacheFallback: true }).then((events) => {
      if (cancelled) return;
      const current = events.find((event) => isEventCurrentlyHappening(event));
      setActiveEventTitle(current?.title);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  return activeEventTitle;
}
