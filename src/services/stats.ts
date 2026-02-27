export function movingAverage(values: number[], window: number): number[] {
  if (window <= 1) return values.slice();
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1);
    out.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return out;
}

export function weeklyTrendFromWindow(points: Array<{ dateISO: string; value: number }>): number | null {
  if (points.length < 2) return null;
  const sorted = points.slice().sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const firstDate = new Date(`${first.dateISO}T00:00:00`);
  const lastDate = new Date(`${last.dateISO}T00:00:00`);
  const days = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24);
  if (!Number.isFinite(days) || days <= 0) return null;
  return ((last.value - first.value) / days) * 7;
}
