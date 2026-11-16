import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Legend,
  LinearScale,
  PieController,
  Tooltip,
} from 'chart.js';
import { useEffect, useRef } from 'react';
import {
  type ChartData,
  readChartTheme,
  seriesColors,
} from '../extensions/dashboardData.js';

Chart.register(
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Legend,
  LinearScale,
  PieController,
  Tooltip,
);

export type ChartKind = 'bar' | 'pie';

export interface ChartCanvasProps {
  kind: ChartKind;
  chart: ChartData;
  label: string;
}

export function ChartCanvas({ kind, chart, label }: ChartCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const theme = readChartTheme();
    const colors = seriesColors(theme, chart.data.length);
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
            borderColor: theme.surface,
            borderWidth: kind === 'pie' ? 1 : 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: {
            display: kind === 'pie',
            position: 'bottom',
            labels: { color: theme.text, boxWidth: 10 },
          },
          tooltip: { enabled: true },
        },
        scales:
          kind === 'bar'
            ? {
                x: {
                  ticks: { color: theme.text },
                  grid: { color: theme.grid },
                },
                y: {
                  beginAtZero: true,
                  ticks: { color: theme.text, precision: 0 },
                  grid: { color: theme.grid },
                },
              }
            : {},
      },
    });
    return () => instance.destroy();
  }, [kind, chart]);

  return (
    <div className="bsh-chart">
      <canvas ref={canvasRef} role="img" aria-label={label} />
    </div>
  );
}
