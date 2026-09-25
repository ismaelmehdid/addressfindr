'use client';

import { Component, type ReactNode } from 'react';

// why: la carte est un complement. Sans WebGL2, ou si son paquet ne se
// telecharge pas, mapbox-gl leve une erreur ; sans cette frontiere elle
// remonterait jusqu'a la page d'erreur et effacerait les adresses trouvees.
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
