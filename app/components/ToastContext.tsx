"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCircle as CheckCircleIcon, X as XIcon, AlertCircle as WarningCircleIcon } from "react-feather";
import { Info as InfoIcon } from "react-feather";

export type ToastTone = "success" | "error" | "info";

type ToastAction = {
  label: string;
  onClick: () => void;
};

type ToastMessage = {
  id: string;
  tone: ToastTone;
  message: string;
  action?: ToastAction;
  durationMs: number;
};

type ToastContextValue = {
  showToast: (options: {
    message: string;
    tone?: ToastTone;
    action?: ToastAction;
    durationMs?: number;
  }) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const timeoutHandlesRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const MAX_TOASTS = 4;

  useEffect(() => () => {
    timeoutHandlesRef.current.forEach((timeout) => {
      globalThis.clearTimeout(timeout);
    });
    timeoutHandlesRef.current.clear();
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
    const timeout = timeoutHandlesRef.current.get(id);
    if (!timeout) return;
    globalThis.clearTimeout(timeout);
    timeoutHandlesRef.current.delete(id);
  }, []);

  const showToast = useCallback(
    ({
      message,
      tone = "success",
      action,
      durationMs = 3200,
    }: {
      message: string;
      tone?: ToastTone;
      action?: ToastAction;
      durationMs?: number;
    }) => {
      const normalizedMessage = message.trim();
      if (!normalizedMessage) return;
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const newToast = { id, tone, message: normalizedMessage, action, durationMs };
      setToasts((current) => {
        const next = [...current, newToast];
        if (next.length <= MAX_TOASTS) return next;
        return next.slice(next.length - MAX_TOASTS);
      });
      if (!durationMs || durationMs <= 0) return;
      const timeout = globalThis.setTimeout(() => {
        removeToast(id);
      }, durationMs);
      timeoutHandlesRef.current.set(id, timeout);
    },
    [removeToast]
  );

  const contextValue = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite" aria-label="Action updates">
        {toasts.map((toast) => (
          <div className={`toast toast-${toast.tone}`} key={toast.id} role={toast.tone === "error" ? "alert" : "status"}>
            <span className="toast-icon" aria-hidden="true">
              {toast.tone === "success" ? <CheckCircleIcon size={18} /> : toast.tone === "error" ? <WarningCircleIcon size={18} /> : <InfoIcon size={18} />}
            </span>
            <div className="toast-message-stack">
              <div className="toast-message">{toast.message}</div>
              {toast.action ? (
                <button
                  type="button"
                  className="toast-action"
                  onClick={() => {
                    removeToast(toast.id);
                    toast.action?.onClick();
                  }}
                >
                  {toast.action.label}
                </button>
              ) : null}
            </div>
            <button type="button" className="toast-close" aria-label="Dismiss notification" onClick={() => removeToast(toast.id)}>
              <XIcon size={15} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider.");
  }
  return context;
}
