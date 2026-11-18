import type { ModelDbId } from './modelSet.js';

export class SelectionHub {
  private readonly listeners = new Set<(items: ModelDbId[]) => void>();

  subscribe(cb: (items: ModelDbId[]) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  emit(items: readonly ModelDbId[]): void {
    for (const cb of [...this.listeners]) {
      try {
        cb(items.map((item) => ({ ...item })));
      } catch (err) {
        console.error(err);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
