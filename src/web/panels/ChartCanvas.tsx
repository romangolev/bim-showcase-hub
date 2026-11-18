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
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/icons.js';
import { Menu } from '../components/Menu.js';
import {
  chartDelimited,
  saveChartCsv,
  saveChartPng,
} from '../extensions/chartExport.js';
import {
  type ChartData,
  mixColors,
  readChartTheme,
  seriesColors,
} from '../extensions/dashboardData.js';
import { useTheme } from '../theme/ThemeContext.js';
import { useDashboardView } from './DashboardSettings.js';

Chart.register(
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  DoughnutController,
  LinearScale,
  Tooltip,
);

export type ChartKind = 'bar' | 'doughnut';

export const LEGEND_LIMIT = 8;
const TICK_LABEL_LIMIT = 10;
const DIM_WEIGHT = 0.35;

export interface ChartCanvasProps {
  kind: ChartKind;
  chart: ChartData;
  label: string;
  exportName?: string;
  highlight?: ReadonlySet<string>;
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
  onSelectLabel,
}: ChartCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const selectRef = useRef(onSelectLabel);
  selectRef.current = onSelectLabel;
  const [notice, setNotice] = useState('');
  const { theme: pageTheme } = useTheme();
  const litKey = highlight?.size ? JSON.stringify([...highlight].sort()) : '';
  const [colors, setColors] = useState<string[]>([]);
  const litKeyRef = useRef(litKey);
  litKeyRef.current = litKey;
  const paintRef = useRef<((litKey: string) => void) | null>(null);
  const [view] = useDashboardView();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.dataset.theme = pageTheme;
    const theme = readChartTheme();
    const colors = seriesColors(
      theme,
      chart.data.map((d) => d.label),
    );
    setColors(colors);
    Chart.defaults.font.family = theme.fontFamily;
    Chart.defaults.font.size = theme.fontSize;
    Chart.defaults.font.weight = Number(theme.fontWeight) || 420;
    Chart.defaults.color = theme.text;
    const labels = chart.data.map((d) => d.label);
    const styleFor = (key: string) => {
      const lit = key ? new Set<string>(JSON.parse(key)) : null;
      return {
        backgroundColor: lit
          ? colors.map((color, index) =>
              lit.has(labels[index] ?? '')
                ? color
                : mixColors(color, theme.surface, DIM_WEIGHT),
            )
          : colors,
        borderWidth: labels.map((name) => (lit?.has(name) ? 2 : 0)),
      };
    };
    const counts = chart.data.map((d) => d.count);
    const instance = new Chart(canvas, {
      type: kind,
      data: {
        labels,
        datasets: [
          {
            label: chart.property,
            data: counts,
            ...styleFor(litKeyRef.current),
            borderColor: theme.label,
            ...(kind === 'bar' ? { minBarLength: 2 } : {}),
            ...(kind === 'doughnut' ? { spacing: 2, borderRadius: 2 } : {}),
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
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
          kind === 'bar'
            ? {
                x: {
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
                  beginAtZero: true,
                  border: { display: false },
                  ticks: { color: theme.text, precision: 0, maxTicksLimit: 4 },
                  grid: { color: theme.grid },
                },
              }
            : {},
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
  }, [kind, chart, pageTheme]);

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
        title: view.pngTitle ? chart.property : undefined,
        legend:
          view.pngLegend && kind === 'doughnut'
            ? shown.map((d, index) => ({
                label: d.label,
                color: colors[index] ?? 'transparent',
              }))
            : undefined,
        more:
          view.pngLegend && kind === 'doughnut'
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
