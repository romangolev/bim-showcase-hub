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
import {
  type ChartData,
  readChartTheme,
  seriesColors,
} from '../extensions/dashboardData.js';
import { useTheme } from '../theme/ThemeContext.js';

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

export interface ChartCanvasProps {
  kind: ChartKind;
  chart: ChartData;
  label: string;
}

function shorten(text: string): string {
  return text.length > TICK_LABEL_LIMIT
    ? `${text.slice(0, TICK_LABEL_LIMIT - 1)}…`
    : text;
}

export function ChartCanvas({ kind, chart, label }: ChartCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme: pageTheme } = useTheme();
  const [colors, setColors] = useState<string[]>([]);

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
    const counts = chart.data.map((d) => d.count);
    const instance = new Chart(canvas, {
      type: kind,
      data: {
        labels,
        datasets: [
          {
            label: chart.property,
            data: counts,
            backgroundColor: colors,
            borderWidth: 0,
            ...(kind === 'doughnut' ? { spacing: 2, borderRadius: 2 } : {}),
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
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
    return () => instance.destroy();
  }, [kind, chart, pageTheme]);

  const legend = chart.data.slice(0, LEGEND_LIMIT);
  const hidden = chart.data.length - legend.length;

  return (
    <div className={`bsh-chart bsh-chart--${kind}`}>
      <div className="bsh-chart__plot">
        <canvas ref={canvasRef} role="img" aria-label={label} />
      </div>
      {kind === 'doughnut' ? (
        <ul className="bsh-legend" aria-label={`Legend for ${chart.property}`}>
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
  );
}
