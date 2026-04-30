type Entry = { ts: string; msg: string; data?: unknown };

const ENTRIES: Entry[] = [];
const MAX = 60;

export function pushDebug(msg: string, data?: unknown): void {
  ENTRIES.push({ ts: new Date().toISOString().slice(11, 23), msg, data });
  while (ENTRIES.length > MAX) ENTRIES.shift();
  console.log("[debug]", msg, data ?? "");
}

export function getDebugLog(): Entry[] {
  return ENTRIES.slice();
}
