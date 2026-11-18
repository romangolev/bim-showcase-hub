import { useEffect, useMemo, useState } from 'react';
import { StateBlock } from '../components/StateBlock.js';
import type { ModelDbId } from '../viewer/modelSet.js';
import type { ElementProperties } from '../viewer/propertyReads.js';
import { useModels } from '../viewer/useModels.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { groupProperties, MAX_SELECTED, valueText } from './propertiesView.js';
import { useResolvedAdapter } from './useScopedRows.js';
import './panels.css';

export interface PropertiesPanelProps {
  adapter?: ViewerAdapter | null;
  title?: string;
  scope?: { value: string; onChange: (scope: string) => void };
}

type Read =
  | { key: string; status: 'loading' }
  | { key: string; status: 'ready'; elements: ElementProperties[] }
  | { key: string; status: 'error'; message: string };

export function PropertiesPanel({
  adapter: override,
  title = 'Properties',
  scope,
}: PropertiesPanelProps) {
  const adapter = useResolvedAdapter(override);
  const models = useModels(adapter);
  const ready = models.filter((model) => model.status === 'ready');
  const model =
    ready.find((m) => m.id === scope?.value || m.urn === scope?.value) ??
    ready[0] ??
    null;
  const modelId = model?.id ?? null;
  const [selection, setSelection] = useState<ModelDbId[]>([]);
  const [filter, setFilter] = useState('');
  const [read, setRead] = useState<Read | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!adapter) {
      setSelection([]);
      return;
    }
    setSelection(adapter.getModelSelection());
    return adapter.onSelectionChange(setSelection);
  }, [adapter]);

  const ids = useMemo(
    () =>
      selection.filter((item) => item.modelId === modelId).map((i) => i.dbId),
    [selection, modelId],
  );
  const key = useMemo(
    () => `${modelId}|${ids.length}|${ids.slice(0, MAX_SELECTED).join(',')}`,
    [modelId, ids],
  );

  useEffect(() => {
    if (!adapter || !modelId || ids.length === 0) {
      setRead(null);
      return;
    }
    let live = true;
    setRead({ key, status: 'loading' });
    adapter
      .getElementsProperties(
        ids.slice(0, MAX_SELECTED).map((dbId) => ({ modelId, dbId })),
      )
      .then(
        (found) => {
          if (!live) return;
          setRead({
            key,
            status: 'ready',
            elements: found.filter(
              (element): element is ElementProperties => element !== null,
            ),
          });
        },
        (err: unknown) => {
          if (!live) return;
          setRead({
            key,
            status: 'error',
            message:
              err instanceof Error ? err.message : 'Could not read properties',
          });
        },
      );
    return () => {
      live = false;
    };
  }, [adapter, modelId, ids, key]);

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice('Copied');
    } catch {
      setNotice('Could not copy to the clipboard');
    }
  };

  const current = read?.key === key ? read : null;
  const elements = current?.status === 'ready' ? current.elements : [];
  const sections = elements.map((element) => ({
    element,
    groups: groupProperties(element.properties, filter),
  }));
  const matches = sections.some((section) => section.groups.length > 0);

  return (
    <section className="bsh-card bsh-props" aria-label={title}>
      <header className="bsh-card__header">
        <h2 className="bsh-card__title">{title}</h2>
      </header>
      {!model ? (
        <StateBlock
          variant="empty"
          title="No model loaded"
          message="Open a model to inspect its elements."
          compact
        />
      ) : (
        <>
          <div className="bsh-props__tools">
            {ready.length > 1 && (
              <select
                className="bsh-select"
                aria-label="Model"
                value={model.id}
                onChange={(event) => scope?.onChange(event.target.value)}
              >
                {ready.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            )}
            <input
              type="search"
              className="bsh-input"
              aria-label="Filter properties"
              placeholder="Filter"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
            <span role="status" className="bsh-props__notice">
              {notice}
            </span>
          </div>
          {ids.length === 0 && (
            <StateBlock
              variant="empty"
              title="Select an element"
              message="Pick an element in the viewer to see its properties."
              compact
            />
          )}
          {current?.status === 'loading' && (
            <StateBlock variant="loading" message="Reading properties" />
          )}
          {current?.status === 'error' && (
            <StateBlock
              variant="error"
              message="We could not read this element's properties."
              detail={current.message}
              compact
            />
          )}
          {current?.status === 'ready' && !matches && (
            <StateBlock
              variant="empty"
              title={filter ? 'No matching properties' : 'No properties'}
              message={
                filter
                  ? 'Change the filter to see more.'
                  : 'This element has no readable properties.'
              }
              compact
            />
          )}
          <div className="bsh-props__body">
            {sections.map(({ element, groups }) =>
              groups.length === 0 ? null : (
                <div key={element.dbId} className="bsh-props__element">
                  {elements.length > 1 && (
                    <h3 className="bsh-props__name">{element.name}</h3>
                  )}
                  {groups.map((group) => (
                    <details key={group.category} open>
                      <summary className="bsh-props__category">
                        {group.category}
                      </summary>
                      <dl className="bsh-props__list">
                        {group.items.map((prop, index) => (
                          <div
                            key={`${index}\u0000${prop.name}`}
                            className="bsh-props__row"
                          >
                            <dt>{prop.name}</dt>
                            <dd>{valueText(prop.value)}</dd>
                            <button
                              type="button"
                              className="bsh-props__copy"
                              aria-label={`Copy ${prop.name}`}
                              onClick={() => copy(valueText(prop.value))}
                            >
                              Copy
                            </button>
                          </div>
                        ))}
                      </dl>
                    </details>
                  ))}
                </div>
              ),
            )}
            {ids.length > MAX_SELECTED && (
              <p className="bsh-muted">
                {`${ids.length - MAX_SELECTED} more selected elements not shown`}
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
