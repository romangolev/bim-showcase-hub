import type { PropertyRow } from '../../shared/types.js';
import { tagRows } from './modelScope.js';
import type { ModelInfo, ModelSet } from './modelSet.js';
import {
  mergeInfos,
  type PropertyInfo,
  type ReadOptions,
  sumProgress,
  throwIfAborted,
} from './propertyReads.js';

export interface ShownModel<H> {
  info: ModelInfo;
  handle: H;
}

export interface PropertySource<H> {
  rows(
    model: ShownModel<H>,
    propertyNames: string[],
    options: ReadOptions,
  ): Promise<PropertyRow[]>;
  infos(model: ShownModel<H>, options: ReadOptions): Promise<PropertyInfo[]>;
}

export function propertiesMessage(err: unknown): string {
  return err instanceof Error && err.message
    ? `Properties could not be read: ${err.message}`
    : 'Properties could not be read';
}

export class PropertyReader<H> {
  constructor(
    private readonly models: ModelSet<H>,
    private readonly source: PropertySource<H>,
  ) {}

  async rows(
    propertyNames: string[],
    modelIds: readonly string[] | undefined,
    options: ReadOptions = {},
  ): Promise<PropertyRow[]> {
    const shown = this.shown(modelIds);
    const progress = sumProgress(options.onProgress);
    const results = await Promise.allSettled(
      shown.map(async (model) =>
        tagRows(
          await this.source.rows(model, propertyNames, {
            ...options,
            onProgress: progress(model.info.id),
          }),
          model.info,
        ),
      ),
    );
    throwIfAborted(options.signal);
    const rows: PropertyRow[] = [];
    let failure: unknown = null;
    results.forEach((result, index) => {
      const id = shown[index]?.info.id;
      if (id === undefined) return;
      if (result.status === 'fulfilled') {
        rows.push(...result.value);
        this.models.setPropertiesError(id);
      } else {
        failure ??= result.reason;
        this.models.setPropertiesError(id, propertiesMessage(result.reason));
      }
    });
    if (failure !== null && rows.length === 0) throw failure;
    return rows;
  }

  async infos(
    modelIds: readonly string[] | undefined,
    options: ReadOptions = {},
  ): Promise<PropertyInfo[]> {
    const progress = sumProgress(options.onProgress);
    const results = await Promise.allSettled(
      this.shown(modelIds).map((model) =>
        this.source.infos(model, {
          ...options,
          onProgress: progress(model.info.id),
        }),
      ),
    );
    throwIfAborted(options.signal);
    const lists: PropertyInfo[][] = [];
    let failure: unknown = null;
    for (const result of results) {
      if (result.status === 'fulfilled') lists.push(result.value);
      else failure ??= result.reason;
    }
    if (failure !== null && lists.length === 0) throw failure;
    return mergeInfos(lists);
  }

  private shown(modelIds: readonly string[] | undefined): ShownModel<H>[] {
    return this.models
      .shown()
      .filter(({ info }) => !modelIds || modelIds.includes(info.id));
  }
}
