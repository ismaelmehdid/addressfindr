'use client';

import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useDashboardHeaderBridge } from './dashboard-header-bridge-context';

export function DashboardPageHeaderBridge({
  children,
}: {
  children: ReactNode;
}) {
  const { target } = useDashboardHeaderBridge();
  if (!target) return null;
  return createPortal(children, target);
}
