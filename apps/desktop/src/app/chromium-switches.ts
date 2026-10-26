/** Chromium feature that gives pages and workers SharedArrayBuffer without cross-origin isolation. */
export const SAB_FEATURE = 'SharedArrayBuffer';

/** Appends `feature` to a comma separated switch value without duplicating it. */
export function withFeature(current: string, feature: string): string {
  const features = current
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean);
  if (!features.includes(feature)) features.push(feature);
  return features.join(',');
}
