type Listener = () => void;

const listeners = new Set<Listener>();
let pending = false;

export function onDeepSearch(listener: Listener): () => void {
  listeners.add(listener);
  if (pending) {
    pending = false;
    listener();
  }
  return () => {
    listeners.delete(listener);
  };
}

export function requestDeepSearch(): void {
  if (listeners.size === 0) pending = true;
  for (const listener of [...listeners]) listener();
}
