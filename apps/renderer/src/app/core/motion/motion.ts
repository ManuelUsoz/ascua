/** Scales a duration that mirrors the CSS by the current `--spd`. */
export function duration(ms: number): number {
  const speed =
    parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--spd'),
    ) || 1;
  return ms * speed;
}
