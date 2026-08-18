import { useEffect, useState } from 'react';

// Some illustrations are large Lottie files (1-2MB); decoding one on mount
// can block the JS thread right as a screen push or tab switch is animating,
// making the transition stutter - most visible on older devices. Deferring
// the mount two animation frames past that transition keeps it smooth.
export function useDeferredMount(enabled: boolean) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (!cancelled) setReady(true);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [enabled]);

  return ready;
}
