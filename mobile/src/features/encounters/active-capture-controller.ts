import type { CaptureSessionStatus } from '@/features/encounters/capture-session-state';

export type ActiveCaptureSnapshot = {
  encounterId: string;
  status: Extract<CaptureSessionStatus, 'recording' | 'paused' | 'processing'>;
  seconds: number;
};

type ActiveCaptureControls = {
  pauseOrResume: () => void | Promise<void>;
  finish: () => void | Promise<void>;
};

type ActiveCaptureController = ActiveCaptureControls & {
  registrationId: symbol;
  snapshot: ActiveCaptureSnapshot;
};

let controller: ActiveCaptureController | null = null;
const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

export function registerActiveCaptureController(
  controls: ActiveCaptureControls,
  initialSnapshot: ActiveCaptureSnapshot,
) {
  const registrationId = Symbol('active-capture-registration');
  const registered: ActiveCaptureController = {
    ...controls,
    registrationId,
    snapshot: initialSnapshot,
  };
  controller = registered;
  emitChange();

  return () => {
    // Snapshot updates replace the controller object. Use a stable registration
    // token so the owning effect can still unregister the updated controller.
    if (controller?.registrationId !== registrationId) return;
    controller = null;
    emitChange();
  };
}

export function updateActiveCaptureSnapshot(snapshot: ActiveCaptureSnapshot) {
  if (!controller || controller.snapshot.encounterId !== snapshot.encounterId) return;
  controller = { ...controller, snapshot };
  emitChange();
}

export function clearActiveCaptureController(encounterId?: string) {
  if (!controller) return;
  if (encounterId && controller.snapshot.encounterId !== encounterId) return;
  controller = null;
  emitChange();
}

export function getActiveCaptureController() {
  return controller;
}

export function subscribeToActiveCapture(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
