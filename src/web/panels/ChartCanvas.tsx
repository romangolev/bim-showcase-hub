import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  LinearScale,
  type Plugin,
  Tooltip,
} from 'chart.js';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/icons.js';
import { Menu, type MenuEntry } from '../components/Menu.js';
import {
  chartDelimited,
  saveChartCsv,
  saveChartPng,
} from '../extensions/chartExport.js';
import { writeClipboard } from '../extensions/clipboard.js';
import {
  AGGREGATE_LABELS,
  type ChartData,
  formatMeasure,
  mixColors,
  OTHER_COLOR,
  readChartTheme,
  seriesColors,
} from '../extensions/dashboardData.js';
import { usePersisted } from '../storage.js';
import { useTheme } from '../theme/ThemeContext.js';
import { patternFill } from './chartPatterns.js';
import { CHART_SETTINGS } from './chartSettings.js';

Chart.register(
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  DoughnutController,
  LinearScale,
  Tooltip,
);

export type ChartKind = 'bar' | 'hbar' | 'doughnut';

export const LEGEND_LIMIT = 8;
const TICK_LABEL_LIMIT = 10;
const DIM_WEIGHT = 0.35;

export function formatLabel(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

const MIN_SLICE_SHARE = 0.04;

export function valueLabelPlugin(
  kind: ChartKind,
  colors: { text: string; surface: string },
): Plugin {
  return {
    id: 'bshValueLabels',
    afterDatasetsDraw(instance) {
      const { ctx } = instance;
      ctx.save();
      ctx.font = `${Chart.defaults.font.weight ?? 400} 11px ${Chart.defaults.font.family}`;
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = colors.surface;
      ctx.fillStyle = colors.text;
      const stacked = instance.data.datasets.length > 1;
      instance.data.datasets.forEach((dataset, datasetIndex) => {
        const meta = instance.getDatasetMeta(datasetIndex);
        if (meta.hidden) return;
        const values = dataset.data.map((v) => (typeof v === 'number' ? v : 0));
        const total = values.reduce((sum, v) => sum + v, 0);
        meta.data.forEach((element, index) => {
          const value = values[index] ?? 0;
          if (value === 0) return;
          let text = formatLabel(value);
          let point: { x: number | null; y: number | null };
          if (kind === 'doughnut') {
            if (value / total < MIN_SLICE_SHARE) return;
            text = `${Math.round((value / total) * 100)}%`;
            point = element.tooltipPosition(false);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
          } else if (stacked) {
            point = (element as unknown as BarElement).getCenterPoint();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
          } else if (kind === 'hbar') {
            const edge = element.getProps(['x', 'y'], true);
            point = { x: (edge.x ?? 0) + 4, y: edge.y ?? null };
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
          } else {
            const edge = element.getProps(['x', 'y'], true);
            point = { x: edge.x ?? null, y: (edge.y ?? 0) - 4 };
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
          }
          if (point.x === null || point.y === null) return;
          ctx.strokeText(text, point.x, point.y);
          ctx.fillText(text, point.x, point.y);
        });
      });
      ctx.restore();
    },
  };
}

export interface ChartCanvasProps {
  kind: ChartKind;
  chart: ChartData;
  label: string;
  title?: ReactNode;
  pngName?: string;
  menuItems?: readonly MenuEntry[];
  dataLabels?: boolean;
  exportName?: string;
  highlight?: ReadonlySet<string>;
  pngTitle?: boolean;
  pngLegend?: boolean;
  onSelectLabel?: (label: string) => void;
  onColorModel?: (colors: readonly string[]) => void;
}

function shorten(text: string): string {
  return text.length > TICK_LABEL_LIMIT
    ? `${text.slice(0, TICK_LABEL_LIMIT - 1)}…`
    : text;
}

export function ChartCanvas({
  kind,
  chart,
  label,
  title,
  pngName,
  menuItems = [],
  dataLabels = false,
  exportName = 'model',
  highlight,
  pngTitle = true,
  pngLegend = true,
  onSelectLabel,
  onColorModel,
}: ChartCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const selectRef = useRef(onSelectLabel);
  selectRef.current = onSelectLabel;
  const [notice, setNotice] = useState('');
  const { theme: pageTheme } = useTheme();
  const [chartSettings] = usePersisted(CHART_SETTINGS);
  const palette = chartSettings.palette;
  const patterns = chartSettings.patterns;
  const litKey = highlight?.size ? JSON.stringify([...highlight].sort()) : '';
  const [colors, setColors] = useState<string[]>([]);
  const litKeyRef = useRef(litKey);
  litKeyRef.current = litKey;
  const paintRef = useRef<((litKey: string) => void) | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.dataset.theme = pageTheme;
    const theme = readChartTheme();
    const colors = seriesColors(
      theme,
      chart.data.map((d) => d.label),
      palette,
    );
    setColors(colors);
    Chart.defaults.font.family = theme.fontFamily;
    Chart.defaults.font.size = theme.fontSize;
    Chart.defaults.font.weight = Number(theme.fontWeight) || 420;
    Chart.defaults.color = theme.text;
    const labels = chart.data.map((d) => d.label);
    const patternCtx = patterns ? canvas.getContext('2d') : null;
    const fillFor = (color: string, index: number) =>
      patternCtx ? patternFill(patternCtx, color, index) : color;
    const models =
      kind !== 'doughnut' && chart.series && chart.series.length >= 2
        ? chart.series
        : null;
    const stacked = models !== null;
    const modelColors = models
      ? seriesColors(
          theme,
          models.map((series) => series.label),
        )
      : [];
    const categoryStyle = (lit: Set<string> | null) => ({
      backgroundColor: colors.map((color, index) => {
        const shown =
          lit && !lit.has(labels[index] ?? '')
            ? mixColors(color, theme.surface, DIM_WEIGHT)
            : color;
        return fillFor(shown, index);
      }),
      borderWidth: labels.map((name) => (lit?.has(name) ? 2 : 0)),
    });
    const modelStyle = (datasetIndex: number, lit: Set<string> | null) => {
      const color = modelColors[datasetIndex] ?? OTHER_COLOR;
      return {
        backgroundColor: labels.map((name, index) =>
          fillFor(
            lit && !lit.has(name)
              ? mixColors(color, theme.surface, DIM_WEIGHT)
              : color,
            index,
          ),
        ),
        borderWidth: labels.map((name) => (lit?.has(name) ? 2 : 0)),
      };
    };
    const styleFor = (datasetIndex: number, key: string) => {
      const lit = key ? new Set<string>(JSON.parse(key)) : null;
      return stacked ? modelStyle(datasetIndex, lit) : categoryStyle(lit);
    };
    const counts = chart.data.map((d) =>
      chart.aggregate && chart.aggregate !== 'count'
        ? (d.value ?? null)
        : d.count,
    );
    const datasets = models
      ? models.map((series, index) => ({
          label: series.label,
          data: series.counts,
          ...styleFor(index, litKeyRef.current),
          borderColor: theme.label,
          minBarLength: 2,
        }))
      : [
          {
            label: chart.measure || chart.property,
            data: counts,
            ...styleFor(0, litKeyRef.current),
            borderColor: theme.label,
            ...(kind !== 'doughnut' ? { minBarLength: 2 } : {}),
            ...(kind === 'doughnut' ? { spacing: 2, borderRadius: 2 } : {}),
          },
        ];
    const horizontal = kind === 'hbar';
    const instance = new Chart(canvas, {
      type: kind === 'doughnut' ? 'doughnut' : 'bar',
      plugins: dataLabels ? [valueLabelPlugin(kind, theme)] : [],
      data: {
        labels,
        datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        ...(dataLabels && kind !== 'doughnut'
          ? {
              layout: {
                padding: horizontal ? { right: 32 } : { top: 18 },
              },
            }
          : {}),
        ...(horizontal ? { indexAxis: 'y' } : {}),
        onClick: (_event, elements) => {
          const index = elements[0]?.index;
          const picked = index === undefined ? undefined : labels[index];
          if (picked !== undefined) selectRef.current?.(picked);
        },
        ...(kind === 'doughnut' ? { cutout: '64%' } : {}),
        plugins: {
          legend: { display: stacked },
          tooltip: { enabled: true },
        },
        scales:
          kind === 'doughnut'
            ? {}
            : horizontal
              ? {
                  x: {
                    ...(stacked ? { stacked: true } : {}),
                    beginAtZero: true,
                    border: { display: false },
                    ticks: {
                      color: theme.text,
                      precision: 0,
                      maxTicksLimit: 4,
                    },
                    grid: { color: theme.grid },
                  },
                  y: {
                    ...(stacked ? { stacked: true } : {}),
                    border: { display: false },
                    ticks: {
                      color: theme.text,
                      autoSkip: true,
                      callback(value) {
                        return shorten(
                          String(this.getLabelForValue(Number(value))),
                        );
                      },
                    },
                    grid: { display: false },
                  },
                }
              : {
                  x: {
                    ...(stacked ? { stacked: true } : {}),
                    border: { display: false },
                    ticks: {
                      color: theme.text,
                      maxRotation: 0,
                      autoSkip: true,
                      callback(value) {
                        return shorten(
                          String(this.getLabelForValue(Number(value))),
                        );
                      },
                    },
                    grid: { display: false },
                  },
                  y: {
                    ...(stacked ? { stacked: true } : {}),
                    beginAtZero: true,
                    border: { display: false },
                    ticks: {
                      color: theme.text,
                      precision: 0,
                      maxTicksLimit: 4,
                    },
                    grid: { color: theme.grid },
                  },
                },
      },
    });
    let painted = litKeyRef.current;
    paintRef.current = (key) => {
      if (key === painted) return;
      painted = key;
      instance.data.datasets.forEach((dataset, index) => {
        Object.assign(dataset, styleFor(index, key));
      });
      instance.update('none');
    };
    return () => {
      paintRef.current = null;
      instance.destroy();
    };
  }, [kind, chart, dataLabels, pageTheme, palette, patterns]);

  useEffect(() => {
    paintRef.current?.(litKey);
  }, [litKey]);

  const exportPng = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const theme = readChartTheme();
    const shown = chart.data.slice(0, LEGEND_LIMIT);
    const done = await saveChartPng(
      canvas,
      theme.surface,
      chart.property,
      exportName,
      {
        title: pngTitle ? (pngName ?? chart.property) : undefined,
        legend:
          pngLegend && kind === 'doughnut'
            ? shown.map((d, index) => ({
                label: d.label,
                color: colors[index] ?? 'transparent',
              }))
            : undefined,
        more:
          pngLegend && kind === 'doughnut'
            ? chart.data.length - shown.length
            : 0,
        text: theme.label,
        font: theme.fontFamily,
      },
    );
    setNotice(done ? '' : 'Could not draw the image');
  };
  const copyChart = async () => {
    setNotice(
      (await writeClipboard(chartDelimited(chart, '\t')))
        ? 'Copied'
        : 'Could not copy to the clipboard',
    );
  };

  const legend = chart.data.slice(0, LEGEND_LIMIT);
  const hidden = chart.data.length - legend.length;

  return (
    <div className="bsh-chart-frame">
      <div className="bsh-chart__tools">
        {title}
        <span role="status" className="bsh-summary__notice">
          {notice}
        </span>
        <Menu
          label={`Options for ${label}`}
          title="Chart options"
          trigger={<Icon name="more" size={16} />}
          triggerClassName="icon-button"
          items={() => [
            ...menuItems,
            ...(menuItems.length > 0
              ? [{ kind: 'separator' as const, id: 'export-sep' }]
              : []),
            { id: 'png', label: 'Download PNG', onSelect: exportPng },
            {
              id: 'csv',
              label: 'Download CSV',
              onSelect: () => saveChartCsv(chart, exportName),
            },
            { id: 'copy', label: 'Copy data', onSelect: copyChart },
            ...(onColorModel
              ? [
                  {
                    id: 'color-model',
                    label: 'Color the model by this chart',
                    onSelect: () => onColorModel(colors),
                  },
                ]
              : []),
          ]}
        />
      </div>
      <div className={`bsh-chart bsh-chart--${kind}`}>
        <div className="bsh-chart__plot">
          <canvas ref={canvasRef} role="img" aria-label={label} />
        </div>
        {kind === 'doughnut' ? (
          <ul
            className="bsh-legend"
            aria-label={`Legend for ${chart.property}`}
          >
            {legend.map((d, index) => (
              <li key={d.label} className="bsh-legend__item">
                <span
                  className="bsh-legend__swatch"
                  style={{ background: colors[index] ?? 'transparent' }}
                  aria-hidden="true"
                />
                <span className="bsh-legend__label" title={d.label}>
                  {d.label}
                </span>
              </li>
            ))}
            {hidden > 0 ? (
              <li className="bsh-legend__item bsh-legend__more">
                {hidden} more in the data table
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

export interface ChartTableProps {
  chart: ChartData;
  label: string;
  title?: ReactNode;
  menuItems?: readonly MenuEntry[];
  highlight?: ReadonlySet<string>;
  onSelectLabel?: (label: string) => void;
  onColorModel?: (colors: readonly string[]) => void;
}

export function ChartTable({
  chart,
  label,
  title,
  menuItems = [],
  highlight,
  onSelectLabel,
  onColorModel,
}: ChartTableProps) {
  const { theme: pageTheme } = useTheme();
  const [chartSettings] = usePersisted(CHART_SETTINGS);
  const palette = chartSettings.palette;
  const colors = useMemo(
    () =>
      seriesColors(
        readChartTheme(),
        chart.data.map((d) => d.label),
        palette,
      ),
    [chart.data, palette, pageTheme],
  );
  const numeric = chart.aggregate !== undefined && chart.aggregate !== 'count';
  const valueLabel = `${AGGREGATE_LABELS[chart.aggregate ?? 'count']}${
    chart.unit ? ` (${chart.unit})` : ''
  }`;

  return (
    <div className="bsh-chart-frame bsh-chart-frame--table">
      <div className="bsh-chart__tools">
        {title}
        <Menu
          label={`Options for ${label}`}
          title="Chart options"
          trigger={<Icon name="more" size={16} />}
          triggerClassName="icon-button"
          items={() => [
            ...menuItems,
            ...(onColorModel
              ? [
                  ...(menuItems.length > 0
                    ? [{ kind: 'separator' as const, id: 'export-sep' }]
                    : []),
                  {
                    id: 'color-model',
                    label: 'Color the model by this chart',
                    onSelect: () => onColorModel(colors),
                  },
                ]
              : []),
          ]}
        />
      </div>
      <div className="bsh-chart-table__wrap">
        <table className="bsh-table bsh-chart-table">
          <caption className="bsh-chart-table__caption">{label}</caption>
          <thead>
            <tr>
              <th scope="col">{chart.property}</th>
              {numeric ? (
                <th scope="col" className="bsh-num">
                  {valueLabel}
                </th>
              ) : null}
              <th scope="col" className="bsh-num">
                {numeric ? 'Elements' : 'Count'}
              </th>
            </tr>
          </thead>
          <tbody>
            {chart.data.map((datum, index) => (
              <tr
                key={datum.label}
                data-active={highlight?.has(datum.label) || undefined}
              >
                <th scope="row">
                  <span className="bsh-chart-table__label">
                    <span
                      className="bsh-legend__swatch"
                      style={{ background: colors[index] ?? 'transparent' }}
                      aria-hidden="true"
                    />
                    {onSelectLabel ? (
                      <button
                        type="button"
                        className="bsh-chart-table__pick"
                        onClick={() => onSelectLabel(datum.label)}
                      >
                        {datum.label}
                      </button>
                    ) : (
                      datum.label
                    )}
                  </span>
                </th>
                {numeric ? (
                  <td className="bsh-num">
                    {datum.value === undefined
                      ? '—'
                      : formatMeasure(datum.value, chart.unit)}
                  </td>
                ) : null}
                <td className="bsh-num">{datum.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
