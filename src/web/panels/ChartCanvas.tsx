import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  LinearScale,
  Tooltip,
} from 'chart.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/icons.js';
import { Menu } from '../components/Menu.js';
import {
  chartDelimited,
  saveChartCsv,
  saveChartPng,
} from '../extensions/chartExport.js';
import {
  AGGREGATE_LABELS,
  type ChartData,
  formatMeasure,
  mixColors,
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

export interface ChartCanvasProps {
  kind: ChartKind;
  chart: ChartData;
  label: string;
  exportName?: string;
  highlight?: ReadonlySet<string>;
  pngTitle?: boolean;
  pngLegend?: boolean;
  onSelectLabel?: (label: string) => void;
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
  exportName = 'model',
  highlight,
  pngTitle = true,
  pngLegend = true,
  onSelectLabel,
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
    const styleFor = (key: string) => {
      const lit = key ? new Set<string>(JSON.parse(key)) : null;
      return {
        backgroundColor: colors.map((color, index) => {
          const shown =
            lit && !lit.has(labels[index] ?? '')
              ? mixColors(color, theme.surface, DIM_WEIGHT)
              : color;
          return patternCtx ? patternFill(patternCtx, shown, index) : shown;
        }),
        borderWidth: labels.map((name) => (lit?.has(name) ? 2 : 0)),
      };
    };
    const counts = chart.data.map((d) =>
      chart.aggregate && chart.aggregate !== 'count'
        ? (d.value ?? null)
        : d.count,
    );
    const horizontal = kind === 'hbar';
    const instance = new Chart(canvas, {
      type: kind === 'doughnut' ? 'doughnut' : 'bar',
      data: {
        labels,
        datasets: [
          {
            label: chart.measure || chart.property,
            data: counts,
            ...styleFor(litKeyRef.current),
            borderColor: theme.label,
            ...(kind !== 'doughnut' ? { minBarLength: 2 } : {}),
            ...(kind === 'doughnut' ? { spacing: 2, borderRadius: 2 } : {}),
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        ...(horizontal ? { indexAxis: 'y' } : {}),
        onClick: (_event, elements) => {
          const index = elements[0]?.index;
          const picked = index === undefined ? undefined : labels[index];
          if (picked !== undefined) selectRef.current?.(picked);
        },
        ...(kind === 'doughnut' ? { cutout: '64%' } : {}),
        plugins: {
          legend: { display: false },
          tooltip: { enabled: true },
        },
        scales:
          kind === 'doughnut'
            ? {}
            : {
                x: horizontal
                  ? {
                      beginAtZero: true,
                      border: { display: false },
                      ticks: {
                        color: theme.text,
                        precision: 0,
                        maxTicksLimit: 4,
                      },
                      grid: { color: theme.grid },
                    }
                  : {
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
                y: horizontal
                  ? {
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
                    }
                  : {
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
      Object.assign(instance.data.datasets[0] ?? {}, styleFor(key));
      instance.update('none');
    };
    return () => {
      paintRef.current = null;
      instance.destroy();
    };
  }, [kind, chart, pageTheme, palette, patterns]);

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
        title: pngTitle ? chart.property : undefined,
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
    try {
      await navigator.clipboard.writeText(chartDelimited(chart, '\t'));
      setNotice('Copied');
    } catch {
      setNotice('Could not copy to the clipboard');
    }
  };

  const legend = chart.data.slice(0, LEGEND_LIMIT);
  const hidden = chart.data.length - legend.length;

  return (
    <div className="bsh-chart-frame">
      <div className="bsh-chart__tools">
        <span role="status" className="bsh-summary__notice">
          {notice}
        </span>
        <Menu
          label={`Export ${label}`}
          title="Export chart"
          trigger={<Icon name="more" size={16} />}
          triggerClassName="bsh-icon-button"
          items={() => [
            { id: 'png', label: 'Download PNG', onSelect: exportPng },
            {
              id: 'csv',
              label: 'Download CSV',
              onSelect: () => saveChartCsv(chart, exportName),
            },
            { id: 'copy', label: 'Copy data', onSelect: copyChart },
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
  highlight?: ReadonlySet<string>;
  onSelectLabel?: (label: string) => void;
}

export function ChartTable({
  chart,
  label,
  highlight,
  onSelectLabel,
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
