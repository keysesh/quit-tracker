import type { Craving, Relapse } from './types';

/** Hour of day (0–23) with the most cravings, once there are enough to call it a pattern. */
export function peakCravingHour(cravings: Craving[], minCount = 3): number | null {
  if (cravings.length < minCount) return null;
  const counts = Array(24).fill(0);
  for (const c of cravings) counts[new Date(c.timestamp).getHours()]++;
  let best = 0;
  for (let h = 1; h < 24; h++) if (counts[h] > counts[best]) best = h;
  return counts[best] >= 2 ? best : null;
}

export function hourCounts(cravings: Craving[]) {
  const counts = Array(24).fill(0) as number[];
  for (const c of cravings) counts[new Date(c.timestamp).getHours()]++;
  return counts;
}

/** Tag counts across cravings and slips, most common first. */
export function tagCounts(cravings: Craving[], relapses: Relapse[]) {
  const m = new Map<string, number>();
  for (const c of cravings) for (const t of c.triggers ?? []) m.set(t, (m.get(t) ?? 0) + 1);
  for (const r of relapses) for (const t of r.triggers ?? []) m.set(t, (m.get(t) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export function formatHour(h: number) {
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${h < 12 ? 'AM' : 'PM'}`;
}
