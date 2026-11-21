import { defineRecord, type PersistedRecord } from '../storage.js';
import type { ModelDbId } from '../viewer/modelSet.js';
import { elementId } from '../viewer/selectionSets.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';

export const MAX_SEARCH_RESULTS = 5000;
export const NAMED_RESULTS = 200;
export const MAX_ATTRIBUTES = 20;
export const MAX_ATTRIBUTE_LENGTH = 120;
export const MAX_SEARCH_TEXT = 200;

export interface SearchSpec {
  text: string;
  attributes: string[];
}

export interface SearchOutcome {
  items: ModelDbId[];
  names: Map<string, string>;
  truncated: boolean;
  failedModels: string[];
}

function cleanAttributes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const name = entry.trim().slice(0, MAX_ATTRIBUTE_LENGTH);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
    if (out.length >= MAX_ATTRIBUTES) break;
  }
  return out;
}

export const SEARCH_SPEC: PersistedRecord<SearchSpec> =
  defineRecord<SearchSpec>({
    key: 'bsh.pane.search.v1',
    initial: { text: '', attributes: [] },
    sanitize: (raw) => {
      const source = (
        typeof raw === 'object' && raw !== null ? raw : {}
      ) as Record<string, unknown>;
      return {
        text:
          typeof source.text === 'string'
            ? source.text.slice(0, MAX_SEARCH_TEXT)
            : '',
        attributes: cleanAttributes(source.attributes),
      };
    },
  });

export async function runElementSearch(
  adapter: ViewerAdapter,
  spec: SearchSpec,
  signal?: AbortSignal,
): Promise<SearchOutcome> {
  const result = await adapter.searchElements(spec.text, {
    attributes: spec.attributes.length ? spec.attributes : undefined,
    signal,
  });
  const items = result.items.slice(0, MAX_SEARCH_RESULTS);
  const names = new Map<string, string>();
  const named = items.slice(0, NAMED_RESULTS);
  if (named.length > 0 && !signal?.aborted) {
    try {
      const properties = await adapter.getElementsProperties(named);
      properties.forEach((entry, index) => {
        const item = named[index];
        if (!item || !entry?.name) return;
        names.set(elementId(item), entry.name);
      });
    } catch {
      names.clear();
    }
  }
  return {
    items,
    names,
    truncated: result.items.length > MAX_SEARCH_RESULTS,
    failedModels: result.failedModels,
  };
}
