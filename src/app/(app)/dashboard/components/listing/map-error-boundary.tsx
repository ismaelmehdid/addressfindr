'use client';

import { Component, type ReactNode } from 'react';

// why: the map is a complement. Without WebGL2, or when its chunk fails to
// download, mapbox-gl throws; without this boundary the error would reach
// the error page and wipe the addresses found.
export class MapErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode; onError?: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(): void {
    this.props.onError?.();
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
