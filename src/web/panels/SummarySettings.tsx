import type { ReactNode } from 'react';
import {
  type FormDefinition,
  SettingsForm,
} from '../components/SettingsForm.js';
import {
  ACTION_LABELS,
  ELEMENT_ACTIONS,
  type ElementAction,
  sanitizeAction,
} from '../extensions/elementActions.js';
import {
  DEFAULT_SUMMARY_VIEW,
  SUMMARY_COLUMNS,
  type SummaryColumn,
  type SummaryView,
} from '../extensions/modelSummary.js';
import { summarySetting } from '../layout/instanceSettings.js';
import type { PanelId } from '../layout/paneRegistry.js';
import {
  setSummarySettingsTarget,
  useSummarySettingsTarget,
} from '../layout/summaryTarget.js';
import type { ModalDefinition } from '../modal/types.js';
import { PANE_SETTINGS } from '../settings/paneSettings.js';
import { usePersisted } from '../storage.js';
import { usePublishedAdapter } from '../viewer/activeAdapterStore.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { PropertyPicker } from './PropertyPicker.js';
import { useResolvedAdapter } from './useScopedRows.js';

export const SUMMARY_SETTINGS_ID = 'summary-settings';

interface SummaryForm {
  hideEmpty: boolean;
  minCount: number;
  sort: string;
  density: string;
  action: ElementAction;
  autoRefresh: boolean;
  columns: SummaryColumn[];
}

export const SUMMARY_FORM: FormDefinition<SummaryForm> = {
  fields: [
    { key: 'hideEmpty', kind: 'toggle', label: 'Hide (empty)' },
    { key: 'minCount', kind: 'number', label: 'Minimum count', min: 1 },
    {
      key: 'sort',
      kind: 'select',
      label: 'Sort by',
      options: [
        { value: 'count', label: 'Count' },
        { value: 'value', label: 'Value' },
      ],
    },
    {
      key: 'density',
      kind: 'select',
      label: 'Density',
      options: [
        { value: 'comfortable', label: 'Comfortable' },
        { value: 'compact', label: 'Compact' },
      ],
    },
    {
      key: 'action',
      kind: 'select',
      label: 'Row click',
      options: ELEMENT_ACTIONS.map((name) => ({
        value: name,
        label: ACTION_LABELS[name],
      })),
    },
    {
      key: 'autoRefresh',
      kind: 'toggle',
      label: 'Refresh when the model changes',
    },
    {
      key: 'columns',
      kind: 'multi',
      label: 'Columns',
      options: SUMMARY_COLUMNS.map((column) => ({
        value: column,
        label: column,
      })),
    },
  ],
};

function GlobalProperties({ adapter }: { adapter: ViewerAdapter | null }) {
  const [properties, setProperties] = usePersisted(
    PANE_SETTINGS.summary.properties,
  );
  return (
    <PropertyPicker
      adapter={adapter}
      value={properties}
      onChange={setProperties}
    />
  );
}

function InstanceProperties({
  target,
  adapter,
}: {
  target: PanelId;
  adapter: ViewerAdapter | null;
}) {
  const [spec, setSpec] = usePersisted(summarySetting(target));
  return (
    <PropertyPicker
      adapter={adapter}
      value={spec.properties}
      onChange={(properties) => setSpec((prev) => ({ ...prev, properties }))}
    />
  );
}

function SummaryFields({
  view,
  action,
  onView,
  onAction,
  onReset,
  properties,
}: {
  view: SummaryView;
  action: ElementAction;
  onView: (view: SummaryView) => void;
  onAction: (action: ElementAction) => void;
  onReset: () => void;
  properties: ReactNode;
}) {
  const value: SummaryForm = {
    hideEmpty: view.hideEmpty,
    minCount: view.minCount,
    sort: view.sort,
    density: view.density,
    action,
    autoRefresh: view.autoRefresh,
    columns: SUMMARY_COLUMNS.filter((c) => !view.hiddenColumns.includes(c)),
  };
  const onChange = (patch: Partial<SummaryForm>) => {
    const { action: nextAction, columns, sort, density, ...rest } = patch;
    if (nextAction !== undefined) onAction(sanitizeAction(nextAction));
    const next: Partial<SummaryView> = { ...rest };
    if (sort !== undefined) next.sort = sort === 'value' ? 'value' : 'count';
    if (density !== undefined) {
      next.density = density === 'compact' ? 'compact' : 'comfortable';
    }
    if (columns) {
      next.hiddenColumns = SUMMARY_COLUMNS.filter((c) => !columns.includes(c));
    }
    if (Object.keys(next).length) onView({ ...view, ...next });
  };
  return (
    <div className="bsh-summary-settings">
      <fieldset className="bsh-fieldset">
        <legend>Properties</legend>
        {properties}
      </fieldset>
      <SettingsForm form={SUMMARY_FORM} value={value} onChange={onChange} />
      <button type="button" className="bsh-button" onClick={onReset}>
        Reset view
      </button>
    </div>
  );
}

function GlobalSummarySettings({ adapter }: { adapter: ViewerAdapter | null }) {
  const [view, setView, resetView] = usePersisted(PANE_SETTINGS.summary.view);
  const [action, setAction, resetAction] = usePersisted(
    PANE_SETTINGS.summary.action,
  );
  return (
    <SummaryFields
      view={view}
      action={action}
      onView={setView}
      onAction={setAction}
      onReset={() => {
        resetView();
        resetAction();
      }}
      properties={<GlobalProperties adapter={adapter} />}
    />
  );
}

function InstanceSummarySettings({
  target,
  adapter,
}: {
  target: PanelId;
  adapter: ViewerAdapter | null;
}) {
  const [spec, setSpec] = usePersisted(summarySetting(target));
  return (
    <SummaryFields
      view={spec.view}
      action={spec.action}
      onView={(view) => setSpec((prev) => ({ ...prev, view }))}
      onAction={(action) => setSpec((prev) => ({ ...prev, action }))}
      onReset={() =>
        setSpec((prev) => ({
          ...prev,
          view: DEFAULT_SUMMARY_VIEW,
          action: 'select',
        }))
      }
      properties={<InstanceProperties target={target} adapter={adapter} />}
    />
  );
}

export function SummarySettingsBody() {
  const target = useSummarySettingsTarget();
  const adapter = useResolvedAdapter(usePublishedAdapter());
  return target ? (
    <InstanceSummarySettings target={target} adapter={adapter} />
  ) : (
    <GlobalSummarySettings adapter={adapter} />
  );
}

export const SUMMARY_SETTINGS_MODAL: ModalDefinition = {
  id: SUMMARY_SETTINGS_ID,
  title: 'Summary settings',
  size: 'lg',
  Body: SummarySettingsBody,
  onClose: () => setSummarySettingsTarget(null),
};
