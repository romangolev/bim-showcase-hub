import { useEffect, useId, useMemo, useState } from 'react';
import type { PropertyRow } from '../../shared/types.js';
import type { ModelDbId } from '../viewer/modelSet.js';
import { readySignature } from '../viewer/modelSet.js';
import {
  ELEMENT_SCOPES,
  type ElementScope,
  filterByElementScope,
  scopeElementItems,
} from '../viewer/propertyScope.js';
import { useModels } from '../viewer/useModels.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';

export const ELEMENT_SCOPE_LABELS: Record<ElementScope, string> = {
  all: 'All elements',
  selected: 'Selected',
  visible: 'Visible',
  isolated: 'Isolated',
};

export const SELECTION_DEBOUNCE_MS = 150;

export interface ElementScopeState {
  elements: ElementScope;
  rows: PropertyRow[];
  total: number;
  pending: boolean;
}

export function useElementScope(
  adapter: ViewerAdapter | null,
  elements: ElementScope,
  rows: PropertyRow[],
  refresh = 0,
): ElementScopeState {
  const models = useModels(adapter);
  const signature = readySignature(models);
  const [items, setItems] = useState<{
    key: string;
    list: ModelDbId[];
  } | null>(null);
  const key = `${elements}|${signature}|${refresh}`;

  useEffect(() => {
    if (!adapter || elements === 'all') return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () =>
      scopeElementItems(adapter, elements).then(
        (list) => {
          if (live) setItems({ key, list });
        },
        () => {
          if (live) setItems({ key, list: [] });
        },
      );
    load();
    const off =
      elements === 'selected'
        ? adapter.onSelectionChange((list) => {
            clearTimeout(timer);
            timer = setTimeout(() => {
              if (live) setItems({ key, list });
            }, SELECTION_DEBOUNCE_MS);
          })
        : undefined;
    return () => {
      live = false;
      clearTimeout(timer);
      off?.();
    };
  }, [adapter, elements, key]);

  const primaryId = models[0]?.id;
  const current = elements === 'all' || items?.key === key;
  const scoped = useMemo(
    () =>
      elements === 'all' || !items || !current
        ? rows
        : filterByElementScope(rows, elements, items.list, primaryId),
    [rows, elements, items, current, primaryId],
  );
  return {
    elements,
    rows: elements !== 'all' && !current ? [] : scoped,
    total: rows.length,
    pending: elements !== 'all' && !current,
  };
}

export function ElementScopeSelect({
  value,
  onChange,
}: {
  value: ElementScope;
  onChange: (next: ElementScope) => void;
}) {
  const id = useId();
  return (
    <div className="bsh-field bsh-scope">
      <label htmlFor={id} className="bsh-sr-only">
        Summarize elements
      </label>
      <select
        id={id}
        className="bsh-select"
        value={value}
        onChange={(event) =>
          onChange(
            ELEMENT_SCOPES.find((s) => s === event.target.value) ?? 'all',
          )
        }
      >
        {ELEMENT_SCOPES.map((scope) => (
          <option key={scope} value={scope}>
            {ELEMENT_SCOPE_LABELS[scope]}
          </option>
        ))}
      </select>
    </div>
  );
}

export function elementScopeLabel(state: ElementScopeState): string {
  if (state.elements === 'all') return '';
  const name = ELEMENT_SCOPE_LABELS[state.elements].toLowerCase();
  if (state.pending) return `Reading ${name} elements`;
  return `Summarizing ${state.rows.length.toLocaleString('en-US')} ${name} of ${state.total.toLocaleString('en-US')} elements`;
}
