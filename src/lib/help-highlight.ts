const PULSE_CLASS = 'help-pulse';
const PULSE_DURATION_MS = 3000;

export function triggerHelpHighlight(elementId: string): void {
  if (typeof document === 'undefined') return;
  const targets = document.querySelectorAll<HTMLElement>(
    `[data-help-id="${CSS.escape(elementId)}"]`,
  );
  if (targets.length === 0) return;
  const first = targets[0];
  if (!first) return;
  first.scrollIntoView({ block: 'center', behavior: 'smooth' });
  for (const el of targets) {
    el.classList.remove(PULSE_CLASS);
    void el.offsetWidth;
    el.classList.add(PULSE_CLASS);
    window.setTimeout(() => {
      el.classList.remove(PULSE_CLASS);
    }, PULSE_DURATION_MS);
  }
}
