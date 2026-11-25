import { useId, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/icons.js';
import { PaneActionsMenu } from '../components/PaneActionsMenu.js';
import { StateBlock } from '../components/StateBlock.js';
import { writeClipboard } from '../extensions/clipboard.js';
import { saveBlob } from '../extensions/download.js';
import type { ElementAction } from '../extensions/elementActions.js';
import {
  itemsWithValues,
  runElementAction,
  showAllElements,
} from '../extensions/elementActions.js';
import { applyNamePattern, toDelimited } from '../extensions/exportFormats.js';
import {
  emptyShares,
  entryKey,
  formatPercent,
  MAX_SUMMARY_COLUMNS,
  MAX_SUMMARY_ROWS,
  type SummaryAggregate,
  type SummaryEntry,
  type SummaryView,
  summarize,
  summaryTable,
  viewEntries,
  viewPropertyNames,
} from '../extensions/modelSummary.js';
import { formatCount } from '../i18n/format.js';
import { PANE_SETTINGS } from '../settings/paneSettings.js';
import { useSettings } from '../settings/SettingsContext.js';
import { usePersisted } from '../storage.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import {
  FailedModels,
  ModelScopeSelect,
  UnavailableModels,
} from './ModelScope.js';
import { QuickSettings, useQuickSettings } from './QuickSettings.js';
import { openSummaryProperty } from './SummaryPropertyDialog.js';
import { SummaryTable } from './SummaryTable.js';
import {
  HIDDEN_MESSAGE,
  HIDDEN_TITLE,
  useResolvedAdapter,
  useScopedRows,
} from './useScopedRows.js';
import './panels.css';
import { Badge } from '../ui/Badge.js';
import { Button } from '../ui/Button.js';
import { Card, CardHeader, CardTitle } from '../ui/Card.js';
import { IconButton } from '../ui/IconButton.js';

export interface SummaryModel {
  label: string;
  tooltip: string;
}

export interface ModelSummaryPanelProps {
  adapter?: ViewerAdapter | null;
  model?: SummaryModel | null;
  propertyNames?: readonly string[];
  onPropertiesChange?: (names: readonly string[]) => void;
  title?: string;
  className?: string;
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  toggleable?: boolean;
  onOpenSettings?: () => void;
  scope?: { value: string; onChange: (scope: string) => void };
  view?: { value: SummaryView; onChange: (view: SummaryView) => void };
  action?: ElementAction;
}

const EMPTY: SummaryEntry[] = [];
export const STACKED_ROW_LIMIT = 12;

export function ModelSummaryPanel({
  adapter,
  model,
  propertyNames: propertyNamesOverride,
  onPropertiesChange,
  title = 'Model summary',
  className,
  collapsed,
  defaultCollapsed = false,
  onCollapsedChange,
  toggleable = true,
  onOpenSettings,
  scope: controlledScope,
  view: controlledView,
  action: controlledAction,
}: ModelSummaryPanelProps) {
  const uid = useId();
  const { language } = useSettings().settings;
  const [innerCollapsed, setInnerCollapsed] = useState(defaultCollapsed);
  const isCollapsed = collapsed ?? innerCollapsed;
  const [showAll, setShowAll] = useState(false);
  const resolved = useResolvedAdapter(adapter);
  const [savedProperties, setSavedProperties] = usePersisted(
    PANE_SETTINGS.summary.properties,
  );
  const propertyNames = propertyNamesOverride ?? savedProperties;
  const setProperties = onPropertiesChange ?? setSavedProperties;
  const [savedView, setSavedView] = usePersisted(PANE_SETTINGS.summary.view);
  const view = controlledView?.value ?? savedView;
  const readNames = useMemo(
    () => viewPropertyNames(propertyNames, view.columns),
    [propertyNames, view.columns],
  );
  const state = useScopedRows(resolved, {
    names: readNames,
    autoRefresh: view.autoRefresh,
    ...(controlledScope ? { models: controlledScope } : {}),
  });
  const partialEntries = useMemo(
    () =>
      state.partialRows.length > 0
        ? summarize(state.partialRows, propertyNames)
        : EMPTY,
    [state.partialRows, propertyNames],
  );
  const entries = useMemo(
    () =>
      state.rows.length > 0
        ? summarize(state.rows, propertyNames)
        : partialEntries,
    [state.rows, propertyNames, partialEntries],
  );
  const sourceRows = state.rows.length > 0 ? state.rows : state.partialRows;

  const [savedAction] = usePersisted(PANE_SETTINGS.summary.action);
  const action = controlledAction ?? savedAction;
  const [active, setActive] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const shown = useMemo(() => viewEntries(entries, view), [entries, view]);
  const shares = useMemo(
    () => emptyShares(entries).filter((share) => share.percent > 0),
    [entries],
  );
  const setView = (next: SummaryView) => {
    if (controlledView) controlledView.onChange(next);
    else setSavedView(next);
  };
  const patch = (next: Partial<SummaryView>) => setView({ ...view, ...next });
  const full =
    propertyNames.length >= MAX_SUMMARY_ROWS &&
    view.columns.length >= MAX_SUMMARY_COLUMNS;
  const openAdd = (initial?: {
    property: string;
    aggregate: SummaryAggregate;
  }) =>
    openSummaryProperty({
      adapter: resolved,
      properties: propertyNames,
      view,
      role: 'column',
      ...(initial ? { initial } : {}),
      apply: (next) => {
        setProperties(next.properties);
        setView(next.view);
      },
    });

  const pick = (entry: SummaryEntry) => {
    if (!resolved) return;
    runElementAction(
      resolved,
      action,
      itemsWithValues(state.rows, entry.property, new Set([entry.value])),
    );
    setActive(entryKey(entry));
  };

  const table = () => summaryTable(shown, view, sourceRows, language);
  const copyTable = async () => {
    const { header, rows } = table();
    setNotice(
      (await writeClipboard(toDelimited(header, rows, '\t')))
        ? `Copied ${rows.length} rows`
        : 'Could not copy to the clipboard',
    );
  };
  const downloadCsv = () => {
    const { header, rows } = table();
    saveBlob(
      new Blob(['\uFEFF', toDelimited(header, rows, ',')], {
        type: 'text/csv;charset=utf-8',
      }),
      applyNamePattern('{model}-summary', model?.label ?? 'model', 'csv'),
    );
  };

  const toggle = () => {
    const next = !isCollapsed;
    if (collapsed === undefined) setInnerCollapsed(next);
    onCollapsedChange?.(next);
  };

  const sectionRef = useRef<HTMLElement>(null);
  const [controls, setControls] = useState<boolean>();
  const quick = useQuickSettings(sectionRef, controls, setControls);

  const bodyId = `${uid}-body`;
  const titleId = `${uid}-title`;
  const toggleLabel = isCollapsed ? `Expand ${title}` : `Collapse ${title}`;

  return (
    <Card
      ref={sectionRef}
      className={`bsh-summary ${className ?? ''}`.trim()}
      aria-labelledby={titleId}
      data-collapsed={isCollapsed}
      data-compact={!isCollapsed && !quick.open}
      data-density={view.density}
      data-rows-collapsed={
        !showAll &&
        (view.layout === 'pivot' ? false : shown.length > STACKED_ROW_LIMIT)
      }
    >
      <CardHeader className="bsh-summary__header">
        <CardTitle id={titleId} className="bsh-summary__title">
          {title}
          {model ? (
            <span className="bsh-summary__model" title={model.tooltip}>
              <span className="bsh-sr-only">: </span>
              {model.label}
            </span>
          ) : null}
        </CardTitle>
        {toggleable ? (
          <IconButton
            label={toggleLabel}
            className="bsh-summary__toggle"
            aria-expanded={!isCollapsed}
            aria-controls={bodyId}
            onClick={toggle}
          >
            <Icon
              name="chevron"
              size={16}
              className="bsh-summary__toggle-icon"
              data-expanded={!isCollapsed}
            />
          </IconButton>
        ) : null}
        {isCollapsed ? null : (
          <QuickSettings
            label="Summary controls"
            open={quick.open}
            onToggle={quick.toggle}
          >
            <ModelScopeSelect state={state.models} label="Summarize models" />
            <Button
              className="bsh-summary__add"
              disabled={full}
              title={
                full
                  ? `The summary already has ${MAX_SUMMARY_ROWS} rows and ${MAX_SUMMARY_COLUMNS} columns`
                  : undefined
              }
              onClick={() => openAdd()}
            >
              <Icon name="plus" size={14} />
              <span className="bsh-summary__add-label">Add property</span>
            </Button>
            <Button
              className="bsh-summary__refresh"
              onClick={state.refresh}
              disabled={!resolved}
            >
              Refresh
            </Button>
            {onOpenSettings ? (
              <IconButton label="Summary settings" onClick={onOpenSettings}>
                <Icon name="settings" size={16} />
              </IconButton>
            ) : null}
          </QuickSettings>
        )}
      </CardHeader>
      <div
        id={bodyId}
        className="bsh-summary__wrap"
        inert={isCollapsed}
        aria-hidden={isCollapsed || undefined}
      >
        <div className="bsh-summary__body">
          {state.status === 'ready' ? (
            <>
              <UnavailableModels models={state.models.unavailable} />
              <FailedModels
                names={state.failed}
                unavailable={state.models.unavailable}
              />
            </>
          ) : null}
          {!resolved && (
            <StateBlock
              variant="empty"
              title="No model loaded yet"
              message="Select a viewable version in the document tree and its element summary appears here."
            />
          )}
          {state.status === 'hidden' && (
            <StateBlock
              variant="empty"
              title={HIDDEN_TITLE}
              message={HIDDEN_MESSAGE}
            />
          )}
          {state.status === 'ready' && state.stale ? (
            <div className="bsh-summary__partial" role="status">
              <span>Data may be stale.</span>
              <Button onClick={state.refresh}>Refresh</Button>
            </div>
          ) : null}
          {resolved && state.status === 'loading' && (
            <div className="bsh-summary__progress">
              <progress
                aria-label="Reading element properties"
                max={state.progress?.total || undefined}
                value={state.progress ? state.progress.loaded : undefined}
              />
              <span role="status">
                {state.progress && state.progress.total > 0
                  ? `Reading element properties: ${formatCount(state.progress.loaded, language)} of ${formatCount(state.progress.total, language)}${state.progress.partial ? ' (partial data)' : ''}`
                  : 'Reading element properties'}
              </span>
              {state.partialRows.length > 0 && state.progress ? (
                <span role="status">
                  {`Partial: ${formatCount(state.partialRows.length, language)} of ${formatCount(state.progress.total, language)} elements`}
                </span>
              ) : null}
              <Button onClick={state.cancel}>Cancel</Button>
            </div>
          )}
          {resolved &&
            state.status === 'loading' &&
            state.total === 0 &&
            entries.length === 0 && <StateBlock variant="loading" rows={5} />}
          {state.status === 'cancelled' && (
            <div className="bsh-summary__partial" role="status">
              <span>
                {state.total > 0
                  ? 'Partial data: the read was cancelled, so these counts may be out of date.'
                  : 'The read was cancelled, so there is nothing to summarize yet.'}
              </span>
              <Button onClick={state.refresh}>Read again</Button>
            </div>
          )}
          {state.status === 'error' && (
            <StateBlock
              variant="error"
              message="We could not read this model's properties. Try again."
              detail={state.message}
              action={{ label: 'Retry', onClick: state.refresh }}
            />
          )}
          {state.status === 'ready' &&
            entries.length === 0 &&
            !state.pending && (
              <StateBlock
                variant="empty"
                title="No elements to summarize"
                message="This version has no readable elements. Try another version."
                action={{ label: 'Refresh', onClick: state.refresh }}
              />
            )}
          {entries.length > 0 && (
            <div className="bsh-summary__tools">
              {view.layout === 'pivot' ? null : (
                <input
                  type="search"
                  className="field"
                  aria-label="Filter summary rows"
                  placeholder="Filter"
                  value={view.text}
                  onChange={(e) => patch({ text: e.target.value })}
                />
              )}
              <PaneActionsMenu
                label="Summary actions"
                actions={() => [
                  { id: 'copy', label: 'Copy table', onSelect: copyTable },
                  { id: 'csv', label: 'Download CSV', onSelect: downloadCsv },
                  { kind: 'separator', id: 'viewer-sep' },
                  {
                    id: 'show-all',
                    label: 'Show all elements',
                    disabled: !resolved,
                    onSelect: () => resolved && showAllElements(resolved),
                  },
                ]}
              />
              <span role="status" className="bsh-summary__notice">
                {notice}
              </span>
              {shares.length > 0 && (
                <ul className="bsh-summary__shares" aria-label="Empty values">
                  {shares.map((share) => (
                    <li key={share.property}>
                      <Badge
                        variant="chip"
                        render={<button type="button" />}
                        className="bsh-summary__share"
                        title="Add as column"
                        onClick={() =>
                          openAdd({
                            property: share.property,
                            aggregate: 'filled',
                          })
                        }
                      >
                        <span className="bsh-sr-only">Add as column: </span>
                        {share.property}: {formatPercent(share.percent)} empty
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {entries.length > 0 && view.columns.length === 0 ? (
            <p className="bsh-summary__hint">
              <span>Add a column to count or total these values.</span>
              <Button onClick={() => openAdd()}>Add a column</Button>
            </p>
          ) : null}
          {entries.length > 0 &&
            shown.length === 0 &&
            view.layout !== 'pivot' && (
              <StateBlock
                variant="empty"
                compact
                title="No rows match"
                message="Change the filter, or reset the view in Summary settings."
              />
            )}
          {(view.layout === 'pivot'
            ? entries.length > 0
            : shown.length > 0) && (
            <SummaryTable
              entries={shown}
              activeKey={active}
              onPick={pick}
              view={view}
              propertyNames={propertyNames}
              rows={sourceRows}
              onTitleChange={(property, title) =>
                patch({
                  titles: { ...view.titles, [property]: title },
                })
              }
            />
          )}
          {shown.length > STACKED_ROW_LIMIT && (
            <Button
              className="summary-toggle"
              aria-expanded={showAll}
              onClick={() => setShowAll((value) => !value)}
            >
              {showAll ? 'Show fewer rows' : `Show all ${shown.length} rows`}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
