'use client';

import { useDashboardHeaderBridge } from './dashboard-header-bridge-context';

export function DashboardHeaderSlot() {
  const { setTarget } = useDashboardHeaderBridge();
  return <div ref={setTarget} className="contents" />;
}
