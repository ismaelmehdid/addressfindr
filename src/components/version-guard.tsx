'use client';

import { useCallback, useEffect, useRef } from 'react';

const BUILD_DEPLOYMENT_ID = process.env.NEXT_PUBLIC_DEPLOYMENT_ID;
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

export function VersionGuard(): null {
  const isChecking = useRef(false);

  const checkVersion = useCallback(async () => {
    if (!BUILD_DEPLOYMENT_ID || isChecking.current) return;
    isChecking.current = true;

    try {
      const res = await fetch('/api/version', {
        credentials: 'omit',
        cache: 'no-store',
      });
      if (!res.ok) return;

      const { deploymentId } = (await res.json()) as {
        deploymentId: string | null;
      };
      if (deploymentId && deploymentId !== BUILD_DEPLOYMENT_ID) {
        window.location.reload();
      }
    } catch {
    } finally {
      isChecking.current = false;
    }
  }, []);

  useEffect(() => {
    if (!BUILD_DEPLOYMENT_ID) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void checkVersion();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    const interval = setInterval(() => void checkVersion(), CHECK_INTERVAL_MS);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(interval);
    };
  }, [checkVersion]);

  return null;
}
