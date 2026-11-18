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
  SUMMARY_COLUMNS,
  type SummaryColumn,
  type SummaryView,
} from '../extensions/modelSummary.js';
import { summarySetting } from '../layout/instanceSettings.js';
import type { PanelId } from '../layout/paneRegistry.js';
import { useSummarySettingsTarget } from '../layout/summaryTarget.js';
import type { ModalDefinition } from '../modal/types.js';
import { PANE_SETTINGS, usePaneSetting } from '../settings/paneSettings.js';
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
  const [properties, setProperties] = usePaneSetting(
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
  const [spec, setSpec] = usePaneSetting(summarySetting(target));
  return (
    <PropertyPicker
      adapter={adapter}
      value={spec.properties}
      onChange={(properties) => setSpec((prev) => ({ ...prev, properties }))}
    />
  );
}

export function SummarySettingsBody() {
  const [view, setView, resetView] = usePaneSetting(PANE_SETTINGS.summary.view);
  const target = useSummarySettingsTarget();
  const adapter = useResolvedAdapter(usePublishedAdapter());
  const [action, setAction] = usePaneSetting(PANE_SETTINGS.summary.action);
  const value: SummaryForm = {
    hideEmpty: view.hideEmpty,
    minCount: view.minCount,
    sort: view.sort,
    density: view.density,
    action,
    columns: SUMMARY_COLUMNS.filter((c) => !view.hiddenColumns.includes(c)),
  };
  const onChange = (patch: Partial<SummaryForm>) => {
    const { action: nextAction, columns, sort, density, ...rest } = patch;
    if (nextAction !== undefined) setAction(sanitizeAction(nextAction));
    const next: Partial<SummaryView> = { ...rest };
    if (sort !== undefined) next.sort = sort === 'value' ? 'value' : 'count';
    if (density !== undefined) {
      next.density = density === 'compact' ? 'compact' : 'comfortable';
    }
    if (columns) {
      next.hiddenColumns = SUMMARY_COLUMNS.filter((c) => !columns.includes(c));
    }
    if (Object.keys(next).length) setView((prev) => ({ ...prev, ...next }));
  };

  return (
    <div className="bsh-summary-settings">
      <fieldset className="bsh-fieldset">
        <legend>Properties</legend>
        {target ? (
          <InstanceProperties target={target} adapter={adapter} />
        ) : (
          <GlobalProperties adapter={adapter} />
        )}
      </fieldset>
      <SettingsForm form={SUMMARY_FORM} value={value} onChange={onChange} />
      <button type="button" className="bsh-button" onClick={resetView}>
        Reset view
      </button>
    </div>
  );
}

export const SUMMARY_SETTINGS_MODAL: ModalDefinition = {
  id: SUMMARY_SETTINGS_ID,
  title: 'Summary settings',
  size: 'lg',
  Body: SummarySettingsBody,
};
