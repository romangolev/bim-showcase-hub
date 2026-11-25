import { SwitchRow } from '../components/SwitchRow.js';
import {
  AGGREGATE_LABELS,
  AGGREGATES,
  type Aggregate,
  TOP_N_MAX,
  TOP_N_MIN,
} from '../extensions/dashboardData.js';
import {
  type DashboardView,
  MAX_CATEGORIES,
  MIN_CATEGORIES,
  viewSpec,
} from '../extensions/dashboardPresets.js';
import {
  ACTION_LABELS,
  ELEMENT_ACTIONS,
  type ElementAction,
  sanitizeAction,
} from '../extensions/elementActions.js';
import {
  type HealthKpiOptions,
  MAX_KPI_THRESHOLD,
} from '../extensions/healthKpis.js';
import {
  DASHBOARD_PANEL,
  useDashboardSpec,
} from '../layout/instanceSettings.js';
import { paneKind } from '../layout/paneRegistry.js';
import {
  setPaneSettingsTarget,
  usePaneSettingsTarget,
} from '../layout/settingsTarget.js';
import type { ModalDefinition } from '../modal/types.js';
import { usePersisted } from '../storage.js';
import { Button } from '../ui/Button.js';
import { FieldLabel } from '../ui/Field.js';
import { Input } from '../ui/Input.js';
import { NumberField } from '../ui/NumberField.js';
import { Select, SelectOption } from '../ui/Select.js';
import { usePublishedAdapter } from '../viewer/activeAdapterStore.js';
import { useModels } from '../viewer/useModels.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { DashboardPresetMenu } from './DashboardPresetMenu.js';
import { HEALTH_KPI_SETTINGS } from './HealthKpis.js';
import { PropertyPicker } from './PropertyPicker.js';
import { usePropertyCatalog } from './usePropertyCatalog.js';
import { useResolvedAdapter } from './useScopedRows.js';

export const DASHBOARD_SETTINGS_ID = 'dashboard-settings';

type ViewSetter = (
  next: DashboardView | ((prev: DashboardView) => DashboardView),
) => void;

interface DashboardFieldsProps {
  adapter: ViewerAdapter | null;
  view: DashboardView;
  setView: ViewSetter;
  resetView: () => void;
  action?: ElementAction;
  setAction?: (action: ElementAction) => void;
  resetAction?: () => void;
  health?: HealthKpiOptions;
  setHealth?: (health: HealthKpiOptions) => void;
  resetHealth?: () => void;
}

function splitNames(text: string): string[] {
  return [
    ...new Set(
      text
        .split(',')
        .map((name) => name.trim())
        .filter((name) => name !== ''),
    ),
  ];
}

function PropertyListField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: readonly string[];
  onCommit: (names: readonly string[]) => void;
}) {
  const joined = value.join(', ');
  return (
    <FieldLabel layout="row">
      {label}
      <Input
        key={joined}
        type="text"
        defaultValue={joined}
        onBlur={(e) => onCommit(splitNames(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </FieldLabel>
  );
}

function DashboardFields({
  adapter,
  view,
  setView,
  resetView,
  action,
  setAction,
  resetAction,
  health,
  setHealth,
  resetHealth,
}: DashboardFieldsProps) {
  const properties = view.properties;
  const spec = viewSpec(view);
  const catalog = usePropertyCatalog(adapter);
  const names = [
    ...new Set([
      ...catalog.catalog.map((info) => info.name),
      ...properties,
      spec.measure,
    ]),
  ].filter((name) => name !== '');
  const readyModels = useModels(adapter).filter(
    (model) => model.status === 'ready',
  ).length;
  const canSplit = readyModels >= 2;
  const patch = (next: Partial<DashboardView>) =>
    setView((prev) => ({ ...prev, ...next }));
  const pickProperties = (next: readonly string[]) =>
    patch({ properties: next });
  const setAggregate = (aggregate: Aggregate) => patch({ aggregate });
  const numeric = spec.aggregate !== 'count';

  return (
    <>
      <fieldset className="settings__section">
        <legend className="settings__heading">Preset</legend>
        <DashboardPresetMenu view={view} apply={setView} />
        <p className="settings__hint">
          Pick a preset, or save the current charts as your own, then update,
          rename or delete it from the same menu.
        </p>
      </fieldset>
      <fieldset className="settings__section">
        <legend className="settings__heading">
          Properties offered by charts
        </legend>
        <PropertyPicker
          adapter={adapter}
          value={properties}
          onChange={pickProperties}
        />
      </fieldset>
      <fieldset className="settings__section">
        <legend className="settings__heading">All charts</legend>
        <FieldLabel layout="row">
          Aggregation
          <Select
            value={spec.aggregate}
            onValueChange={(next) => setAggregate(next as Aggregate)}
          >
            {AGGREGATES.map((aggregate) => (
              <SelectOption key={aggregate} value={aggregate}>
                {AGGREGATE_LABELS[aggregate]}
              </SelectOption>
            ))}
          </Select>
        </FieldLabel>
        {numeric ? (
          <FieldLabel layout="row">
            Measure
            <Select
              value={names.includes(spec.measure) ? spec.measure : ''}
              onValueChange={(next) => {
                const measure = next;
                patch({
                  measure,
                  properties:
                    !measure || properties.includes(measure)
                      ? properties
                      : [...properties, measure],
                });
              }}
            >
              <SelectOption value="">Choose a property</SelectOption>
              {names.map((name) => (
                <SelectOption key={name} value={name}>
                  {name}
                </SelectOption>
              ))}
            </Select>
          </FieldLabel>
        ) : null}
        <FieldLabel layout="row">
          Maximum categories
          <NumberField
            min={Math.max(MIN_CATEGORIES, TOP_N_MIN)}
            max={Math.min(MAX_CATEGORIES, TOP_N_MAX)}
            value={spec.topN}
            onValueCommitted={(topN) =>
              patch({
                topN,
                maxCategories: Math.min(topN, MAX_CATEGORIES),
              })
            }
          />
        </FieldLabel>
        <SwitchRow
          label="Fold values beyond the top into Other"
          checked={spec.otherBucket}
          onChange={() => patch({ otherBucket: !spec.otherBucket })}
        />
        <p className="settings__hint">
          Numeric aggregations read the trailing unit and convert within one
          unit family. Different families are reported, not summed.
        </p>
        {action !== undefined && setAction ? (
          <FieldLabel layout="row">
            Chart click
            <Select
              value={action}
              onValueChange={(next) => setAction(sanitizeAction(next))}
            >
              {ELEMENT_ACTIONS.map((name) => (
                <SelectOption key={name} value={name}>
                  {ACTION_LABELS[name]}
                </SelectOption>
              ))}
            </Select>
          </FieldLabel>
        ) : null}
        <SwitchRow
          label="Split by model"
          description={
            canSplit
              ? undefined
              : 'Open a second model to split a chart by model.'
          }
          checked={view.splitByModel === true}
          disabled={!canSplit}
          onChange={() =>
            patch({ splitByModel: view.splitByModel ? undefined : true })
          }
        />
        <SwitchRow
          label="Include the title in exported PNGs"
          checked={view.pngTitle}
          onChange={() => patch({ pngTitle: !view.pngTitle })}
        />
        <SwitchRow
          label="Include the legend in exported PNGs"
          checked={view.pngLegend}
          onChange={() => patch({ pngLegend: !view.pngLegend })}
        />
      </fieldset>
      {health && setHealth ? (
        <fieldset className="settings__section">
          <legend className="settings__heading">Model health</legend>
          <SwitchRow
            label="Show model health tiles"
            checked={health.enabled}
            onChange={() => setHealth({ ...health, enabled: !health.enabled })}
          />
          <FieldLabel layout="row">
            Health threshold (%)
            <NumberField
              min={0}
              max={MAX_KPI_THRESHOLD}
              value={health.threshold}
              onValueCommitted={(threshold) =>
                setHealth({ ...health, threshold })
              }
            />
          </FieldLabel>
          <PropertyListField
            label="Must-have properties"
            value={health.mustHave}
            onCommit={(mustHave) => setHealth({ ...health, mustHave })}
          />
          <PropertyListField
            label="Unique properties"
            value={health.unique}
            onCommit={(unique) => setHealth({ ...health, unique })}
          />
          <FieldLabel layout="row">
            Numeric property
            <Select
              value={names.includes(health.measure) ? health.measure : ''}
              onValueChange={(next) => setHealth({ ...health, measure: next })}
            >
              <SelectOption value="">Not checked</SelectOption>
              {names.map((name) => (
                <SelectOption key={name} value={name}>
                  {name}
                </SelectOption>
              ))}
            </Select>
          </FieldLabel>
          {resetHealth ? (
            <div className="settings__actions">
              <Button onClick={resetHealth}>Reset health checks</Button>
            </div>
          ) : null}
        </fieldset>
      ) : null}
      <div className="settings__actions">
        <Button
          onClick={() => {
            resetView();
            resetAction?.();
            resetHealth?.();
          }}
        >
          {health ? 'Reset dashboard' : 'Reset chart'}
        </Button>
      </div>
    </>
  );
}

export function DashboardSettingsBody() {
  const target = usePaneSettingsTarget();
  const adapter = useResolvedAdapter(usePublishedAdapter());
  const { main, view, setView, resetView, action, setAction, resetAction } =
    useDashboardSpec(
      paneKind(target) === 'chart' && target ? target : DASHBOARD_PANEL,
    );
  const [health, setHealth, resetHealth] = usePersisted(HEALTH_KPI_SETTINGS);
  return (
    <DashboardFields
      adapter={adapter}
      view={view}
      setView={setView}
      resetView={resetView}
      action={action}
      setAction={setAction}
      resetAction={resetAction}
      {...(main ? { health, setHealth, resetHealth } : {})}
    />
  );
}

export const DASHBOARD_SETTINGS_MODAL: ModalDefinition = {
  id: DASHBOARD_SETTINGS_ID,
  title: 'Dashboard settings',
  size: 'lg',
  Body: DashboardSettingsBody,
  onClose: () => setPaneSettingsTarget(null),
};
