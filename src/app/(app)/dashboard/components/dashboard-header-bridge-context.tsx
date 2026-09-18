'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

type DashboardHeaderBridgeValue = {
  target: HTMLElement | null;
  setTarget: (node: HTMLElement | null) => void;
};

const DashboardHeaderBridgeContext =
  createContext<DashboardHeaderBridgeValue | null>(null);

export function DashboardHeaderBridgeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [target, setTargetState] = useState<HTMLElement | null>(null);
  const setTarget = useCallback((node: HTMLElement | null) => {
    setTargetState(node);
  }, []);
  const value = useMemo(() => ({ target, setTarget }), [target, setTarget]);
  return (
    <DashboardHeaderBridgeContext.Provider value={value}>
      {children}
    </DashboardHeaderBridgeContext.Provider>
  );
}

export function useDashboardHeaderBridge(): DashboardHeaderBridgeValue {
  const ctx = useContext(DashboardHeaderBridgeContext);
  if (!ctx) {
    throw new Error(
      'useDashboardHeaderBridge must be used within DashboardHeaderBridgeProvider',
    );
  }
  return ctx;
}
