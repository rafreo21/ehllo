import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

// react-native-svg's Svg node - enough of its surface for our toDataURL call.
type SvgRef = { toDataURL: (callback: (base64: string) => void) => void };

type QueueItem = {
  value: string;
  size: number;
  color: string;
  backgroundColor: string;
  resolve: (base64: string) => void;
  reject: (error: unknown) => void;
};

let queue: QueueItem[] = [];
let notify: (() => void) | null = null;

/**
 * The `qrcode` npm package's toDataURL resolves to a canvas-based renderer
 * that doesn't exist in Hermes/React Native - it throws silently there. This
 * renders QR PNGs through react-native-svg's real native rasterizer instead
 * (the same one react-native-qrcode-svg uses on-screen), off-screen.
 * Requires <WidgetQrRenderer /> to be mounted once, e.g. in the root layout.
 */
export function requestQrDataUrl(
  value: string,
  size = 512,
  options?: { color?: string; backgroundColor?: string },
): Promise<string> {
  return new Promise((resolve, reject) => {
    queue.push({
      value,
      size,
      color: options?.color ?? '#163300',
      backgroundColor: options?.backgroundColor ?? '#FFFFFF',
      resolve,
      reject,
    });
    notify?.();
  });
}

export function WidgetQrRenderer() {
  const [current, setCurrent] = useState<QueueItem | null>(null);
  const svgRef = useRef<SvgRef | null>(null);

  useEffect(() => {
    notify = () => setCurrent((prev) => prev ?? queue[0] ?? null);
    notify();
    return () => {
      notify = null;
    };
  }, []);

  useEffect(() => {
    if (!current) return;

    let cancelled = false;
    let raf2 = 0;

    // A view positioned at extreme negative coordinates can be treated as
    // "outside the viewport" by some native render/layout passes and never
    // actually get drawn, leaving toDataURL with nothing to rasterize. This
    // renderer instead sits at normal (0,0) and hides via opacity + a 1x1
    // clipped container, so it always goes through a real layout/paint pass.
    // A single requestAnimationFrame isn't reliably enough time for a freshly
    // mounted/changed 512x512 QR matrix to finish native layout - wait two.
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        svgRef.current?.toDataURL((base64: string) => {
          if (cancelled) return;
          cancelled = true;
          current.resolve(base64);
          queue = queue.filter((item) => item !== current);
          setCurrent(queue[0] ?? null);
        });
      });
    });

    // Safety net: never let a stuck native rasterization hang the caller
    // forever - reject after a generous timeout so syncAllWidgets can still
    // finish (without a QR image) instead of silently stalling indefinitely.
    const timeout = setTimeout(() => {
      if (cancelled) return;
      cancelled = true;
      current.reject(new Error('QR rasterization timed out.'));
      queue = queue.filter((item) => item !== current);
      setCurrent(queue[0] ?? null);
    }, 4000);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(timeout);
    };
  }, [current]);

  if (!current) return null;

  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, width: 1, height: 1, overflow: 'hidden', opacity: 0 }}>
      <QRCode
        value={current.value}
        size={current.size}
        color={current.color}
        backgroundColor={current.backgroundColor}
        ecl="H"
        getRef={(ref: SvgRef) => {
          svgRef.current = ref;
        }}
      />
    </View>
  );
}
