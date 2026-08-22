"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type NavigationRequestHandler = (href: string, proceed: () => void) => void;

export type AppShellChrome = {
  backHref?: string;
  backLabel?: string;
  leading?: ReactNode;
  actions?: ReactNode;
  requestNavigation?: NavigationRequestHandler;
};

type ChromeContextValue = {
  chrome: AppShellChrome;
  setChrome: (chrome: AppShellChrome) => void;
};

const AppShellChromeContext = createContext<ChromeContextValue | null>(null);

export function AppShellChromeProvider({ children }: { children: ReactNode }) {
  const [chrome, setChrome] = useState<AppShellChrome>({});
  const value = useMemo(() => ({ chrome, setChrome }), [chrome]);
  return <AppShellChromeContext.Provider value={value}>{children}</AppShellChromeContext.Provider>;
}

export function useAppShellChromeValue(): AppShellChrome {
  const context = useContext(AppShellChromeContext);
  return context?.chrome ?? {};
}

/** Pages call this to register their back button / header actions with the persistent AppShell. */
export function useAppShellChrome(chrome: AppShellChrome) {
  const context = useContext(AppShellChromeContext);
  const setChrome = context?.setChrome;
  const { backHref, backLabel, leading, actions, requestNavigation } = chrome;
  useEffect(() => {
    void Promise.resolve().then(() => setChrome?.({ backHref, backLabel, leading, actions, requestNavigation }));
    return () => void Promise.resolve().then(() => setChrome?.({}));
  }, [setChrome, backHref, backLabel, leading, actions, requestNavigation]);
}
