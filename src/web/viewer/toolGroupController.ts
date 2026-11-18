import type { ModelDbId } from './modelSet.js';
import type { Rgba, ToolGroupSpec } from './ViewerAdapter.js';

export interface ToolGroupState {
  hasSelection: boolean;
  painted: boolean;
}

export interface SelectionSource {
  getModelSelection(): ModelDbId[];
  onSelectionChange(cb: (items: ModelDbId[]) => void): () => void;
}

export class ToolGroupController {
  private current: ToolGroupState;
  private readonly listeners = new Set<(state: ToolGroupState) => void>();
  private readonly unsubscribe: () => void;

  constructor(
    readonly spec: ToolGroupSpec,
    source: SelectionSource,
  ) {
    this.current = {
      hasSelection: source.getModelSelection().length > 0,
      painted: false,
    };
    this.unsubscribe = source.onSelectionChange((ids) => {
      this.update({ hasSelection: ids.length > 0 });
    });
  }

  get state(): ToolGroupState {
    return this.current;
  }

  subscribe(cb: (state: ToolGroupState) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  paint(color: Rgba): void {
    if (!this.current.hasSelection) return;
    if (this.spec.paint?.onPaint(color)) this.update({ painted: true });
  }

  reset(): void {
    if (!this.current.painted) return;
    this.spec.paint?.onReset();
    this.update({ painted: false });
  }

  export(id: string): void {
    this.spec.exports.find((entry) => entry.id === id)?.onExport();
  }

  clearPainted(): void {
    this.update({ painted: false });
  }

  resetState(): void {
    this.update({ hasSelection: false, painted: false });
  }

  dispose(): void {
    this.unsubscribe();
    this.listeners.clear();
  }

  private update(patch: Partial<ToolGroupState>): void {
    const next = { ...this.current, ...patch };
    if (
      next.hasSelection === this.current.hasSelection &&
      next.painted === this.current.painted
    ) {
      return;
    }
    this.current = next;
    for (const cb of [...this.listeners]) cb(next);
  }
}
