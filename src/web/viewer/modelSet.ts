export const MAX_COMBINED_MODELS = 6;

export const MODEL_LIMIT_MESSAGE = `A combined view holds up to ${MAX_COMBINED_MODELS} models. Remove one to add another.`;
export const DUPLICATE_MODEL_MESSAGE =
  'This version is already open in this viewer.';
export const EMPTY_SOURCE_MESSAGE = 'A model URN is required';

export type ModelStatus = 'loading' | 'ready' | 'error';

export interface ModelSource {
  urn: string;
  name?: string;
}

export interface ModelInfo {
  id: string;
  urn: string;
  name: string;
  visible: boolean;
  status: ModelStatus;
  error?: string;
}

export interface ModelDbId {
  modelId: string;
  dbId: number;
}

export type ModelSetErrorCode = 'limit' | 'duplicate' | 'empty';

export class ModelSetError extends Error {
  constructor(
    readonly code: ModelSetErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ModelSetError';
  }
}

export function modelIdFor(urn: string): string {
  return urn;
}

export function uniqueSources(sources: readonly ModelSource[]): ModelSource[] {
  if (sources.length === 0) {
    throw new ModelSetError('empty', EMPTY_SOURCE_MESSAGE);
  }
  const seen = new Set<string>();
  const unique: ModelSource[] = [];
  for (const source of sources) {
    if (!source.urn) throw new ModelSetError('empty', EMPTY_SOURCE_MESSAGE);
    if (seen.has(source.urn)) continue;
    seen.add(source.urn);
    unique.push(source);
  }
  return unique;
}

export function checkCapacity(
  current: number,
  adding: number,
  cap = MAX_COMBINED_MODELS,
): void {
  if (current + adding > cap) {
    throw new ModelSetError('limit', MODEL_LIMIT_MESSAGE);
  }
}

export function readySignature(models: readonly ModelInfo[]): string {
  return models
    .filter((model) => model.status === 'ready')
    .map((model) => model.id)
    .join('\n');
}

export function loadFailureMessage(models: readonly ModelInfo[]): string {
  const first = models.find((model) => model.error)?.error ?? 'Load failed';
  if (models.length <= 1) return first;
  return `None of the ${models.length} models could be loaded. ${first}`;
}

interface Entry<H> {
  info: ModelInfo;
  handle?: H;
}

export class ModelSet<H> {
  private readonly entries = new Map<string, Entry<H>>();
  private readonly listeners = new Set<(models: ModelInfo[]) => void>();
  private serial = 0;

  constructor(private readonly cap = MAX_COMBINED_MODELS) {}

  get size(): number {
    return this.entries.size;
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  list(): ModelInfo[] {
    return [...this.entries.values()].map((entry) => ({ ...entry.info }));
  }

  get(id: string): ModelInfo | undefined {
    const entry = this.entries.get(id);
    return entry ? { ...entry.info } : undefined;
  }

  handle(id: string): H | undefined {
    return this.entries.get(id)?.handle;
  }

  ready(): { info: ModelInfo; handle: H }[] {
    const out: { info: ModelInfo; handle: H }[] = [];
    for (const entry of this.entries.values()) {
      if (entry.info.status === 'ready' && entry.handle !== undefined) {
        out.push({ info: { ...entry.info }, handle: entry.handle });
      }
    }
    return out;
  }

  idOf(handle: H): string | undefined {
    for (const [id, entry] of this.entries) {
      if (entry.handle === handle) return id;
    }
    return undefined;
  }

  activeCount(): number {
    let count = 0;
    for (const entry of this.entries.values()) {
      if (entry.info.status !== 'error') count += 1;
    }
    return count;
  }

  primaryId(): string | undefined {
    return this.ready()[0]?.info.id;
  }

  add(source: ModelSource): ModelInfo {
    if (!source.urn) throw new ModelSetError('empty', EMPTY_SOURCE_MESSAGE);
    const id = modelIdFor(source.urn);
    const existing = this.entries.get(id);
    if (existing && existing.info.status !== 'error') {
      throw new ModelSetError('duplicate', DUPLICATE_MODEL_MESSAGE);
    }
    checkCapacity(this.activeCount(), 1, this.cap);
    if (!existing) this.serial += 1;
    const info: ModelInfo = {
      id,
      urn: source.urn,
      name:
        source.name?.trim() || existing?.info.name || `Model ${this.serial}`,
      visible: true,
      status: 'loading',
    };
    this.entries.set(id, { info });
    this.emit();
    return { ...info };
  }

  resolve(id: string, handle: H): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;
    const { id: modelId, urn, name, visible } = entry.info;
    entry.handle = handle;
    entry.info = { id: modelId, urn, name, visible, status: 'ready' };
    this.emit();
    return true;
  }

  fail(id: string, message: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.handle = undefined;
    entry.info = { ...entry.info, status: 'error', error: message };
    this.emit();
  }

  remove(id: string): { info: ModelInfo; handle?: H } | undefined {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    this.entries.delete(id);
    if (this.entries.size === 0) this.serial = 0;
    this.emit();
    return { info: { ...entry.info }, handle: entry.handle };
  }

  setVisible(id: string, visible: boolean): boolean {
    const entry = this.entries.get(id);
    if (!entry || entry.info.visible === visible) return false;
    entry.info = { ...entry.info, visible };
    this.emit();
    return true;
  }

  clear(): H[] {
    const handles: H[] = [];
    for (const entry of this.entries.values()) {
      if (entry.handle !== undefined) handles.push(entry.handle);
    }
    const had = this.entries.size > 0;
    this.entries.clear();
    this.serial = 0;
    if (had) this.emit();
    return handles;
  }

  onChange(cb: (models: ModelInfo[]) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  dispose(): void {
    this.listeners.clear();
  }

  private emit(): void {
    const snapshot = this.list();
    for (const cb of [...this.listeners]) {
      try {
        cb(snapshot.map((model) => ({ ...model })));
      } catch (err) {
        console.error(err);
      }
    }
  }
}
