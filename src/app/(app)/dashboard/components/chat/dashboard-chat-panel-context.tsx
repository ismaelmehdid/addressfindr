'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { useLocalStorage } from '../../hooks/use-local-storage';

export const DASHBOARD_CHAT_PANEL_WIDTH_STORAGE_KEY =
  'app_dashboard_chat_panel_width_px';

export const DEFAULT_DASHBOARD_CHAT_PANEL_WIDTH_PX = 420;
export const MIN_DASHBOARD_CHAT_PANEL_WIDTH_PX = 360;
export const MAX_DASHBOARD_CHAT_PANEL_WIDTH_PX = 1200;

function clampPanelWidthPx(width: number): number {
  return Math.min(
    MAX_DASHBOARD_CHAT_PANEL_WIDTH_PX,
    Math.max(MIN_DASHBOARD_CHAT_PANEL_WIDTH_PX, Math.round(width)),
  );
}

type DashboardChatPanelContextValue = {
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  panelWidthPx: number;
  setPanelWidthPx: (width: number) => void;
};

const DashboardChatPanelContext =
  createContext<DashboardChatPanelContextValue | null>(null);

export function DashboardChatPanelProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [isOpen, setOpenState] = useState(true);
  const [storedWidthPx, setStoredWidthPx] = useLocalStorage<number>(
    DASHBOARD_CHAT_PANEL_WIDTH_STORAGE_KEY,
    DEFAULT_DASHBOARD_CHAT_PANEL_WIDTH_PX,
  );
  const panelWidthPx = clampPanelWidthPx(storedWidthPx);

  const setOpen = useCallback((open: boolean) => setOpenState(open), []);
  const toggle = useCallback(() => setOpenState((v) => !v), []);

  const setPanelWidthPx = useCallback(
    (width: number) => setStoredWidthPx(clampPanelWidthPx(width)),
    [setStoredWidthPx],
  );

  const value = useMemo(
    () => ({ isOpen, setOpen, toggle, panelWidthPx, setPanelWidthPx }),
    [isOpen, setOpen, toggle, panelWidthPx, setPanelWidthPx],
  );

  return (
    <DashboardChatPanelContext.Provider value={value}>
      {children}
    </DashboardChatPanelContext.Provider>
  );
}

export function useDashboardChatPanel(): DashboardChatPanelContextValue {
  const ctx = useContext(DashboardChatPanelContext);
  if (!ctx) {
    throw new Error(
      'useDashboardChatPanel must be used within DashboardChatPanelProvider',
    );
  }
  return ctx;
}
