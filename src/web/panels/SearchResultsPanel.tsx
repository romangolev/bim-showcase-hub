import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useRef, useState } from 'react';
import { memberLabel } from '../api/modelTitles.js';
import { StateBlock } from '../components/StateBlock.js';
import {
  MAX_SEARCH_RESULTS,
  runElementSearch,
  SEARCH_SPEC,
  type SearchOutcome,
} from '../extensions/elementSearch.js';
import { useSettings } from '../settings/SettingsContext.js';
import { usePersisted } from '../storage.js';
import { notify } from '../tasks/notifications.js';
import { startTask } from '../tasks/taskStore.js';
import type { ModelInfo } from '../viewer/modelSet.js';
import { elementId, saveSelectionSet } from '../viewer/selectionSets.js';
import { stableKeysFor } from '../viewer/setResolution.js';
import { useModels } from '../viewer/useModels.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { PropertyPicker } from './PropertyPicker.js';
import { setMessages } from './SelectionSets.js';
import { useResolvedAdapter } from './useScopedRows.js';
import './panels.css';

export interface SearchResultsPanelProps {
  adapter?: ViewerAdapter | null;
}

const ROW_HEIGHT = 28;

function labelOf(model: ModelInfo): string {
  return memberLabel(model.id, { file: model.name, v: model.version });
}

export function SearchResultsPanel({ adapter }: SearchResultsPanelProps) {
  const { language } = useSettings().settings;
  const resolved = useResolvedAdapter(adapter);
  const [spec, setSpec] = usePersisted(SEARCH_SPEC);
  const [outcome, setOutcome] = useState<SearchOutcome | null>(null);
  const [status, setStatus] = useState<'idle' | 'searching' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [showAttributes, setShowAttributes] = useState(false);
  const [saveName, setSaveName] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const models = useModels(resolved);
  const signature = models
    .map((model) => `${model.id}:${model.status}:${model.visible ? 1 : 0}`)
    .join('|');
  const signatureRef = useRef(signature);
  const outcomeRef = useRef(outcome);
  outcomeRef.current = outcome;

  const labels = new Map(models.map((model) => [model.id, labelOf(model)]));

  useEffect(() => {
    if (signatureRef.current === signature) return;
    signatureRef.current = signature;
    if (outcomeRef.current) setStale(true);
  }, [signature]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const search = async () => {
    if (!resolved || !spec.text.trim()) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setStatus('searching');
    setError(null);
    const task = startTask({
      label: 'Searching elements',
      cancel: () => controller.abort(),
    });
    try {
      const result = await runElementSearch(resolved, spec, controller.signal);
      if (controller.signal.aborted) {
        task.finish('Cancelled');
        if (controllerRef.current === controller) setStatus('idle');
        return;
      }
      setOutcome(result);
      setStale(false);
      setStatus('idle');
      task.finish(`${result.items.length.toLocaleString('en-US')} results`);
    } catch (err: unknown) {
      if (controller.signal.aborted) {
        task.finish('Cancelled');
        if (controllerRef.current === controller) setStatus('idle');
        return;
      }
      const message = err instanceof Error ? err.message : 'Search failed';
      setError(message);
      setStatus('error');
      task.fail(err);
    }
  };

  const save = async () => {
    if (!resolved || !outcome || !saveName?.trim()) return;
    const stable = await stableKeysFor(resolved, outcome.items);
    const result = saveSelectionSet(saveName, outcome.items, stable);
    if (result === 'ok') {
      notify(`Saved the selection set "${saveName.trim()}"`, {
        tone: 'success',
      });
      setSaveName(null);
    } else {
      notify(setMessages(language)[result], { tone: 'error' });
    }
  };

  const items = outcome?.items ?? [];
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });
  const none = items.length === 0;
  const failed = outcome?.failedModels ?? [];

  return (
    <section className="bsh-card bsh-search" aria-label="Search elements">
      <header className="bsh-card__header bsh-search__header">
        <h2 className="bsh-card__title">Search elements</h2>
        <span className="bsh-muted">
          {outcome ? `${items.length.toLocaleString('en-US')} results` : ''}
        </span>
      </header>
      <form
        className="bsh-search__form"
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
      >
        <input
          type="search"
          className="bsh-input"
          aria-label="Search elements"
          placeholder="Name or property value"
          value={spec.text}
          onChange={(event) =>
            setSpec((current) => ({ ...current, text: event.target.value }))
          }
        />
        <button
          type="submit"
          className="bsh-button"
          disabled={!resolved || !spec.text.trim()}
        >
          Search
        </button>
        <button
          type="button"
          className="bsh-button"
          aria-expanded={showAttributes}
          disabled={!resolved}
          onClick={() => setShowAttributes((open) => !open)}
        >
          Attributes
        </button>
      </form>
      <div className="bsh-search__actions">
        <button
          type="button"
          className="bsh-button"
          disabled={!resolved || none}
          onClick={() => resolved?.selectModelIds(items)}
        >
          Select all
        </button>
        <button
          type="button"
          className="bsh-button"
          disabled={!resolved || none}
          onClick={() => resolved?.isolateModelIds(items)}
        >
          Isolate
        </button>
        <button
          type="button"
          className="bsh-button"
          disabled={!resolved || none}
          onClick={() => resolved?.fitToView(items)}
        >
          Fit
        </button>
        <button
          type="button"
          className="bsh-button"
          disabled={!resolved || none}
          onClick={() =>
            setSaveName((current) => (current === null ? '' : null))
          }
        >
          Save as selection set
        </button>
      </div>
      {saveName !== null ? (
        <form
          className="bsh-search__save"
          aria-label="Save as selection set"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <input
            type="text"
            className="bsh-input"
            aria-label="Selection set name"
            placeholder="Name the results"
            value={saveName}
            onChange={(event) => setSaveName(event.target.value)}
          />
          <button
            type="submit"
            className="bsh-button"
            disabled={!saveName.trim()}
          >
            Save
          </button>
        </form>
      ) : null}
      {showAttributes && resolved ? (
        <PropertyPicker
          adapter={resolved}
          value={spec.attributes}
          onChange={(attributes) =>
            setSpec((current) => ({ ...current, attributes: [...attributes] }))
          }
          minimum={0}
        />
      ) : null}
      {!resolved ? (
        <StateBlock
          variant="empty"
          title="No model loaded"
          message="Open a model to search its elements."
        />
      ) : null}
      {status === 'searching' ? (
        <StateBlock variant="loading" message="Searching elements" rows={3} />
      ) : null}
      {status === 'error' ? (
        <StateBlock
          variant="error"
          message="We could not search this model. Try again."
          detail={error ?? undefined}
          action={{ label: 'Retry', onClick: () => void search() }}
        />
      ) : null}
      {resolved && status === 'idle' && !outcome ? (
        <StateBlock
          variant="empty"
          title="Search across the open models"
          message="Type a word and press Enter. Results become a selection or a saved set."
        />
      ) : null}
      {resolved && status === 'idle' && outcome && none ? (
        <StateBlock
          variant="empty"
          title="No elements match"
          message="Try another word, or search every attribute."
        />
      ) : null}
      {outcome?.truncated ? (
        <p className="bsh-search__notice">
          Showing the first {MAX_SEARCH_RESULTS.toLocaleString('en-US')} results
        </p>
      ) : null}
      {failed.length > 0 ? (
        <p className="bsh-search__notice">
          Not searched: {failed.map((id) => labels.get(id) ?? id).join(', ')}
        </p>
      ) : null}
      {stale ? (
        <div className="bsh-search__stale" role="status">
          <span>Results may be out of date.</span>
          <button
            type="button"
            className="bsh-button"
            onClick={() => void search()}
          >
            Search again
          </button>
        </div>
      ) : null}
      {items.length > 0 ? (
        <div
          className="bsh-search__list"
          ref={scrollRef}
          role="listbox"
          aria-label="Search results"
        >
          <div
            className="bsh-search__spacer"
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualizer.getVirtualItems().map((virtual) => {
              const item = items[virtual.index];
              if (!item) return null;
              const name = outcome?.names.get(elementId(item));
              return (
                <button
                  key={elementId(item)}
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="bsh-search__row"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtual.start}px)`,
                  }}
                  onClick={() => {
                    if (!resolved) return;
                    resolved.selectModelIds([item]);
                    resolved.fitToView([item]);
                  }}
                >
                  <span className="bsh-search__name">
                    {name ?? `#${item.dbId}`}
                  </span>
                  <span className="bsh-search__model">
                    {labels.get(item.modelId) ?? item.modelId}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
