import { useState } from 'react';
import { Icon } from '../components/icons.js';
import { Menu, type MenuEntry } from '../components/Menu.js';
import { StateBlock } from '../components/StateBlock.js';
import {
  AGGREGATE_LABELS,
  CHART_TYPE_LABELS,
  CHART_TYPES,
  type ChartData,
  type ChartType,
} from '../extensions/dashboardData.js';
import {
  chartTitle,
  type DashboardChart,
  MAX_CHART_NAME,
} from '../extensions/dashboardPresets.js';
import { localeOf } from '../i18n/format.js';
import type { Language } from '../settings/settings.js';
import { Input } from '../ui/Input.js';
import { ChartCanvas, type ChartKind, ChartTable } from './ChartCanvas.js';

const CANVAS_KIND: Record<Exclude<ChartType, 'table'>, ChartKind> = {
  bar: 'bar',
  hbar: 'hbar',
  doughnut: 'doughnut',
};

const AGGREGATE_PAST: Record<string, string> = {
  sum: 'total',
  avg: 'average',
  min: 'minimum',
  max: 'maximum',
};

export function chartLabel(chart: ChartData, type: ChartType): string {
  const aggregate = chart.aggregate ?? 'count';
  const measure = chart.measure ?? chart.property;
  const unit = chart.unit ? ` (${chart.unit})` : '';
  if (type === 'table') {
    return aggregate === 'count'
      ? `Element counts by ${chart.property}`
      : `${AGGREGATE_LABELS[aggregate]} of ${measure}${unit} by ${chart.property}`;
  }
  const shape =
    type === 'hbar'
      ? 'Horizontal bar chart'
      : type === 'doughnut'
        ? 'Doughnut chart'
        : 'Bar chart';
  if (aggregate === 'count') {
    return `${shape} of ${type === 'doughnut' ? 'element share' : 'element counts'} by ${chart.property}`;
  }
  const what = `${AGGREGATE_PAST[aggregate] ?? aggregate} ${measure}${unit}`;
  return `${shape} of ${what} by ${chart.property}`;
}

export interface ChartActions {
  setProperty: (property: string) => void;
  setType: (type: ChartType) => void;
  toggleLabels: () => void;
  rename: () => void;
  remove: () => void;
}

export function chartMenuItems(
  chart: DashboardChart,
  properties: readonly string[],
  actions: ChartActions,
): MenuEntry[] {
  const choices = properties.includes(chart.property)
    ? properties
    : [chart.property, ...properties];
  return [
    ...choices.map((name) => ({
      id: `property:${name}`,
      label: `Group by ${name}`,
      checked: chart.property === name,
      onSelect: () => actions.setProperty(name),
    })),
    { kind: 'separator', id: 'type-sep' },
    ...CHART_TYPES.map((type) => ({
      id: `type:${type}`,
      label: `Chart type: ${CHART_TYPE_LABELS[type]}`,
      checked: chart.chartType === type,
      onSelect: () => actions.setType(type),
    })),
    { kind: 'separator', id: 'labels-sep' },
    {
      id: 'data-labels',
      label: 'Show data labels',
      checked: chart.dataLabels,
      disabled: chart.chartType === 'table',
      onSelect: actions.toggleLabels,
    },
    { id: 'rename', label: 'Rename chart', onSelect: actions.rename },
    { id: 'remove', label: 'Remove chart', onSelect: actions.remove },
  ];
}

interface ChartTileProps {
  spec: DashboardChart;
  chart: ChartData | null;
  properties: readonly string[];
  language: Language;
  exportName: string;
  highlight?: ReadonlySet<string>;
  pngTitle: boolean;
  pngLegend: boolean;
  tableOpen: boolean;
  onChange: (patch: Partial<Omit<DashboardChart, 'id'>>) => void;
  onRemove: () => void;
  onSelectLabel: (label: string) => void;
  onColorModel: (colors: readonly string[]) => void;
}

export function ChartTile({
  spec,
  chart,
  properties,
  language,
  exportName,
  highlight,
  pngTitle,
  pngLegend,
  tableOpen,
  onChange,
  onRemove,
  onSelectLabel,
  onColorModel,
}: ChartTileProps) {
  const [renaming, setRenaming] = useState(false);
  const title = chartTitle(spec);
  const items = chartMenuItems(spec, properties, {
    setProperty: (property) => onChange({ property }),
    setType: (chartType) => onChange({ chartType }),
    toggleLabels: () => onChange({ dataLabels: !spec.dataLabels }),
    rename: () => setRenaming(true),
    remove: onRemove,
  });
  const heading = renaming ? (
    <Input
      type="text"
      className="bsh-chart__rename"
      aria-label="Chart name"
      maxLength={MAX_CHART_NAME}
      defaultValue={title}
      ref={(el) => {
        if (el && document.activeElement !== el) {
          el.focus();
          el.select();
        }
      }}
      onBlur={(e) => {
        const next = e.target.value.trim();
        onChange({ name: next && next !== spec.property ? next : undefined });
        setRenaming(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') setRenaming(false);
      }}
    />
  ) : (
    <h3 className="bsh-chart__title" title={title}>
      {title}
    </h3>
  );

  if (!chart || chart.data.length === 0 || chart.mixed || chart.unavailable) {
    const message = !chart
      ? {
          title: 'No values',
          text: `This model has no ${spec.property} values.`,
        }
      : chart.mixed
        ? {
            title: 'Mixed units',
            text: `These values carry different units (${(chart.units ?? []).join(', ')}), so they are not summed.`,
          }
        : chart.unavailable
          ? {
              title: chart.measure
                ? 'No numeric values'
                : 'Choose a numeric property',
              text: chart.measure
                ? `The ${AGGREGATE_LABELS[chart.aggregate ?? 'count'].toLowerCase()} needs numbers in ${chart.measure}.`
                : 'Pick a property to aggregate in Dashboard settings.',
            }
          : {
              title: 'No values',
              text: `This model has no ${spec.property} values.`,
            };
    return (
      <div className="bsh-tile">
        <div className="bsh-chart__tools">
          {heading}
          <TileMenu items={items} label={title} />
        </div>
        <StateBlock
          variant="empty"
          compact
          title={message.title}
          message={message.text}
        />
      </div>
    );
  }

  return (
    <div className="bsh-tile">
      {spec.chartType === 'table' ? (
        <ChartTable
          chart={chart}
          label={chartLabel(chart, 'table')}
          title={heading}
          menuItems={items}
          highlight={highlight}
          onSelectLabel={onSelectLabel}
          onColorModel={onColorModel}
        />
      ) : (
        <>
          <ChartCanvas
            kind={CANVAS_KIND[spec.chartType]}
            chart={chart}
            label={chartLabel(chart, spec.chartType)}
            title={heading}
            pngName={title}
            menuItems={items}
            dataLabels={spec.dataLabels}
            exportName={exportName}
            highlight={highlight}
            pngTitle={pngTitle}
            pngLegend={pngLegend}
            onSelectLabel={onSelectLabel}
            onColorModel={onColorModel}
          />
          <TileData chart={chart} language={language} open={tableOpen} />
        </>
      )}
    </div>
  );
}

function TileMenu({ items, label }: { items: MenuEntry[]; label: string }) {
  return (
    <Menu
      label={`Options for ${label}`}
      title="Chart options"
      trigger={<Icon name="more" size={16} />}
      items={() => items}
    />
  );
}

function TileData({
  chart,
  language,
  open,
}: {
  chart: ChartData;
  language: Language;
  open: boolean;
}) {
  const numeric = chart.aggregate && chart.aggregate !== 'count';
  return (
    <details className="bsh-details" open={open}>
      <summary>Data table</summary>
      <table className="bsh-table">
        <caption className="bsh-sr-only">
          {chart.measure
            ? `${AGGREGATE_LABELS[chart.aggregate ?? 'count']} of ${chart.measure} by ${chart.property}`
            : `Element counts by ${chart.property}`}
        </caption>
        <thead>
          <tr>
            <th scope="col">{chart.property}</th>
            {numeric && chart.aggregate ? (
              <th scope="col" className="bsh-num">
                {AGGREGATE_LABELS[chart.aggregate]}
                {chart.unit ? ` (${chart.unit})` : ''}
              </th>
            ) : null}
            {chart.series?.map((series) => (
              <th key={series.modelId} scope="col" className="bsh-num">
                {series.label}
              </th>
            ))}
            <th scope="col" className="bsh-num">
              Count
            </th>
          </tr>
        </thead>
        <tbody>
          {chart.data.map((d, index) => (
            <tr key={d.label}>
              <td>{d.label}</td>
              {numeric ? (
                <td className="bsh-num">
                  {d.value === undefined
                    ? '—'
                    : d.value.toLocaleString(localeOf(language), {
                        maximumFractionDigits: 2,
                      })}
                </td>
              ) : null}
              {chart.series?.map((series) => (
                <td key={series.modelId} className="bsh-num">
                  {series.counts[index] ?? 0}
                </td>
              ))}
              <td className="bsh-num">{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
