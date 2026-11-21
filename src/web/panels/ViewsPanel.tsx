import { useEffect, useId, useState } from 'react';
import { StateBlock } from '../components/StateBlock.js';
import { usePersisted } from '../storage.js';
import { useModels } from '../viewer/useModels.js';
import type { ViewerAdapter, ViewNode } from '../viewer/ViewerAdapter.js';
import {
  orderViews,
  switchView,
  VIEW_PREFS,
  viewPrefsFor,
  withFavorite,
  withHidden,
  withStartView,
} from '../viewer/views.js';
import { useResolvedAdapter } from './useScopedRows.js';
import './panels.css';

export interface ViewsPanelProps {
  adapter?: ViewerAdapter | null;
}

export const SWITCH_WARNING =
  'Switching resets the selection and colours of this model.';
export const DIMENSION_NOTICE =
  'A combined tab can only show views of the same dimension as the model it starts with.';
export const SWITCH_FAILED_NOTICE = 'Could not switch the view.';

interface ListedViews {
  modelId: string;
  views: ViewNode[];
}

export function ViewsPanel({ adapter: override }: ViewsPanelProps) {
  const titleId = useId();
  const adapter = useResolvedAdapter(override);
  const models = useModels(adapter);
  const [prefs, setPrefs] = usePersisted(VIEW_PREFS);
  const [selected, setSelected] = useState<string | null>(null);
  const [listed, setListed] = useState<ListedViews | null>(null);
  const [pending, setPending] = useState<ViewNode | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [notice, setNotice] = useState('');
  const ready = models.filter((model) => model.status === 'ready');
  const model =
    ready.find((entry) => entry.id === selected) ?? ready[0] ?? null;
  const modelId = model?.id ?? null;
  const modelView = model?.view ?? '';

  useEffect(() => {
    if (!adapter || !modelId) {
      setListed(null);
      return;
    }
    let cancelled = false;
    adapter.listViews(modelId).then(
      (views) => {
        if (!cancelled) setListed({ modelId, views });
      },
      () => {
        if (!cancelled) setListed({ modelId, views: [] });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [adapter, modelId, modelView]);

  if (!adapter || !model) {
    return (
      <section className="bsh-card bsh-views" aria-labelledby={titleId}>
        <header className="bsh-card__header">
          <h2 id={titleId} className="bsh-card__title">
            Sheets and views
          </h2>
        </header>
        <StateBlock
          variant="empty"
          title="No model loaded"
          message="Open a model to browse its sheets and views."
          compact
        />
      </section>
    );
  }

  const urn = model.urn;
  const prefsForModel = viewPrefsFor(urn, prefs);
  const startView = prefsForModel.start;
  const views: ViewNode[] | null =
    listed && listed.modelId === modelId ? listed.views : null;
  const ordered = orderViews(views ?? [], prefsForModel);

  const toggleFavorite = (view: ViewNode, on: boolean) =>
    setPrefs((current) => withFavorite(current, urn, view.id, on));

  const toggleHidden = (view: ViewNode, on: boolean) =>
    setPrefs((current) => withHidden(current, urn, view.id, on));

  const toggleStart = (view: ViewNode) =>
    setPrefs((current) =>
      withStartView(current, urn, startView === view.id ? null : view.id),
    );

  const confirm = async () => {
    if (!pending) return;
    const target = pending;
    setPending(null);
    const result = await switchView(adapter, model.id, target);
    setNotice(
      result === 'dimension'
        ? DIMENSION_NOTICE
        : result === 'failed'
          ? SWITCH_FAILED_NOTICE
          : '',
    );
  };

  const row = (view: ViewNode) => {
    const favorite = prefsForModel.favorites.includes(view.id);
    const hidden = prefsForModel.hidden.includes(view.id);
    const start = startView === view.id;
    return (
      <li key={view.id} className="bsh-models__row" data-current={view.current}>
        <span className="bsh-muted">{view.role === '2d' ? '2D' : '3D'}</span>
        <span className="bsh-models__main">
          <span className="bsh-models__name">
            <span className="bsh-models__label">{view.name}</span>
            {view.current ? <span className="bsh-muted">Current</span> : null}
            {start ? <span className="bsh-muted">Start</span> : null}
          </span>
        </span>
        <span className="bsh-models__actions">
          <button
            type="button"
            className="btn"
            aria-label={`Open ${view.name}`}
            disabled={view.current || hidden}
            onClick={() => {
              setNotice('');
              setPending(view);
            }}
          >
            Open
          </button>
          <button
            type="button"
            className="btn"
            aria-label={`${favorite ? 'Remove favorite' : 'Favorite'} ${view.name}`}
            aria-pressed={favorite}
            onClick={() => toggleFavorite(view, !favorite)}
          >
            {favorite ? 'Unfavorite' : 'Favorite'}
          </button>
          <button
            type="button"
            className="btn"
            aria-label={`${hidden ? 'Show' : 'Hide'} ${view.name}`}
            aria-pressed={hidden}
            onClick={() => toggleHidden(view, !hidden)}
          >
            {hidden ? 'Show' : 'Hide'}
          </button>
          <button
            type="button"
            className="btn"
            aria-label={`${start ? 'Clear start view' : 'Set as start view'} ${view.name}`}
            aria-pressed={start}
            onClick={() => toggleStart(view)}
          >
            {start ? 'Clear start view' : 'Set as start view'}
          </button>
        </span>
      </li>
    );
  };

  const sections = [
    { key: 'favorites', title: 'Favorites', views: ordered.favorites },
    { key: 'views3d', title: '3D views', views: ordered.views3d },
    { key: 'sheets', title: 'Sheets', views: ordered.sheets },
  ];

  return (
    <section className="bsh-card bsh-views" aria-labelledby={titleId}>
      <header className="bsh-card__header">
        <h2 id={titleId} className="bsh-card__title">
          Sheets and views
        </h2>
      </header>
      {ready.length > 1 ? (
        <label className="bsh-models__ghost">
          <span>Model</span>
          <select
            className="field"
            aria-label="Model"
            value={model.id}
            onChange={(event) => {
              setSelected(event.target.value);
              setPending(null);
              setNotice('');
            }}
          >
            {ready.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {pending ? (
        <div className="bsh-models__tools">
          <p className="bsh-muted" role="alert">
            {SWITCH_WARNING} Open {pending.name}?
          </p>
          <button type="button" className="btn" onClick={() => void confirm()}>
            Switch view
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setPending(null)}
          >
            Cancel
          </button>
        </div>
      ) : null}
      {notice ? (
        <p className="bsh-error" role="status">
          {notice}
        </p>
      ) : null}
      {views === null ? (
        <StateBlock variant="loading" message="Reading views" compact />
      ) : views.length === 0 ? (
        <StateBlock
          variant="empty"
          title="No views found"
          message="This model has no sheets or 3D views."
          compact
        />
      ) : (
        <>
          {sections.map((section) =>
            section.views.length > 0 ? (
              <div key={section.key}>
                <h3 className="bsh-models__subtitle">{section.title}</h3>
                <ul className="bsh-models__list">{section.views.map(row)}</ul>
              </div>
            ) : null,
          )}
          {ordered.hidden.length > 0 ? (
            <>
              <div className="bsh-models__tools">
                <button
                  type="button"
                  className="btn"
                  aria-expanded={showHidden}
                  onClick={() => setShowHidden((on) => !on)}
                >
                  {showHidden
                    ? `Hide hidden (${ordered.hidden.length})`
                    : `Show hidden (${ordered.hidden.length})`}
                </button>
              </div>
              {showHidden ? (
                <ul className="bsh-models__list">{ordered.hidden.map(row)}</ul>
              ) : null}
            </>
          ) : null}
        </>
      )}
      <p className="bsh-muted">
        A start view is used the next time this tab loads. Switching a view
        resets the selection and colours of that model.
      </p>
    </section>
  );
}
