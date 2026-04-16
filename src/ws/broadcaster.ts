export type BroadcastFn = (event: Record<string, unknown>) => void;

const listeners: Set<BroadcastFn> = new Set();

export function addListener(fn: BroadcastFn): void {
  listeners.add(fn);
}

export function removeListener(fn: BroadcastFn): void {
  listeners.delete(fn);
}

export function broadcast(event: Record<string, unknown>): void {
  for (const fn of listeners) {
    try {
      fn(event);
    } catch {
      // ignore listener errors
    }
  }
}
