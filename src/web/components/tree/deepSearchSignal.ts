type Listener = () => void;

const listeners = new Set<Listener>();

export function onDeepSearch(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function requestDeepSearch(): void {
  for (const listener of [...listeners]) listener();
}
