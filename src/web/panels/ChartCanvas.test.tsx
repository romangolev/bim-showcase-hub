import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMemoryStorage } from '../test/mockApi.js';
import { act, fireEvent, render, screen } from '../test/render.js';
import { useTheme } from '../theme/ThemeContext.js';
import { ChartCanvas } from './ChartCanvas.js';

const created = vi.hoisted(() => ({
  charts: [] as {
    config: unknown;
    destroy: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    data: { datasets: Record<string, unknown>[] };
  }[],
}));

vi.mock('chart.js', () => {
  class Chart {
    static register = vi.fn();
    static defaults = { font: {}, color: '' };
    destroy = vi.fn();
    update = vi.fn();
    data: { datasets: Record<string, unknown>[] };
    constructor(_canvas: unknown, config: unknown) {
      this.data = (config as { data: Chart['data'] }).data;
      created.charts.push({
        config,
        destroy: this.destroy,
        update: this.update,
        data: this.data,
      });
    }
  }
  const stub = {};
  return {
    Chart,
    ArcElement: stub,
    BarController: stub,
    BarElement: stub,
    CategoryScale: stub,
    LinearScale: stub,
    DoughnutController: stub,
    Tooltip: stub,
  };
});

const PALETTES = {
  dark: {
    '--color-signal-blue': '#3b82f6',
    '--color-graphite': '#131416',
    '--color-ash': '#9d9e9f',
    '--color-fog': '#858687',
    '--color-chalk': '#cececf',
  },
  light: {
    '--color-signal-blue': '#2563eb',
    '--color-graphite': '#ffffff',
    '--color-ash': '#5f6675',
    '--color-fog': '#515867',
    '--color-chalk': '#272a31',
  },
} as const;

const chart = {
  property: 'Category',
  total: 6,
  data: [
    { label: 'Walls', count: 4 },
    { label: 'Doors', count: 2 },
  ],
};

const splitChart = {
  property: 'Category',
  total: 6,
  data: [
    { label: 'Walls', count: 4 },
    { label: 'Doors', count: 2 },
  ],
  series: [
    { modelId: 'a', label: 'A.rvt', counts: [3, 1] },
    { modelId: 'b', label: 'B.rvt', counts: [1, 1] },
  ],
};

function colorsOf(index: number): string[] {
  const entry = created.charts[index];
  if (!entry) throw new Error(`chart ${index} was not created`);
  const config = entry.config as {
    data: { datasets: { backgroundColor: string[] }[] };
  };
  return config.data.datasets[0]?.backgroundColor ?? [];
}

function Switch() {
  const { toggleTheme } = useTheme();
  return (
    <button type="button" onClick={toggleTheme}>
      switch theme
    </button>
  );
}

function applyPalette() {
  const theme =
    document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  for (const [name, value] of Object.entries(PALETTES[theme])) {
    document.documentElement.style.setProperty(name, value);
  }
}

beforeEach(() => {
  installMemoryStorage();
  created.charts.length = 0;
  document.documentElement.dataset.theme = 'dark';
  const original = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
    applyPalette();
    return original(element);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute('style');
});

describe('ChartCanvas theming', () => {
  it('rebuilds the chart with the new palette when the theme changes', () => {
    render(
      <>
        <Switch />
        <ChartCanvas kind="doughnut" chart={chart} label="Share" />
      </>,
    );
    expect(created.charts).toHaveLength(1);
    const first = created.charts[0];
    const firstColors = colorsOf(0);
    const swatchBefore = screen.getAllByRole('listitem')[0]?.firstElementChild;
    const colorBefore = (swatchBefore as HTMLElement).style.background;

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'switch theme' }));
    });

    expect(first?.destroy).toHaveBeenCalledTimes(1);
    expect(created.charts).toHaveLength(2);
    const secondColors = colorsOf(1);
    expect(secondColors).not.toEqual(firstColors);
    const swatchAfter = screen.getAllByRole('listitem')[0]?.firstElementChild;
    expect((swatchAfter as HTMLElement).style.background).not.toBe(colorBefore);
    expect(document.querySelector('canvas')?.getAttribute('data-theme')).toBe(
      'light',
    );
  });

  it('reads axis colours from the page theme at render time', () => {
    render(<ChartCanvas kind="bar" chart={chart} label="Counts" />);
    const config = created.charts[0]?.config as {
      options: {
        scales: {
          x: { ticks: { color: string } };
          y: { grid: { color: string } };
        };
      };
    };
    expect(config.options.scales.x.ticks.color).toBe('#858687');
  });
});

describe('ChartCanvas highlight', () => {
  it('repaints in place instead of rebuilding when the highlight changes', () => {
    const { rerender } = render(
      <ChartCanvas kind="bar" chart={chart} label="Counts" />,
    );
    const first = created.charts[0];
    const before = first?.data.datasets[0]?.backgroundColor;
    rerender(
      <ChartCanvas
        kind="bar"
        chart={chart}
        label="Counts"
        highlight={new Set([chart.data[0]?.label ?? ''])}
      />,
    );
    expect(created.charts).toHaveLength(1);
    expect(first?.destroy).not.toHaveBeenCalled();
    expect(first?.update).toHaveBeenCalledWith('none');
    expect(first?.data.datasets[0]?.backgroundColor).not.toEqual(before);
    expect(first?.data.datasets[0]?.borderWidth).toEqual(
      chart.data.map((_, index) => (index === 0 ? 2 : 0)),
    );
  });
});

describe('ChartCanvas split by model', () => {
  it('stacks one dataset per model in a bar chart', () => {
    render(<ChartCanvas kind="bar" chart={splitChart} label="Counts" />);
    const config = created.charts[0]?.config as {
      data: { datasets: { label: string; data: number[] }[] };
      options: {
        scales: { x: { stacked?: boolean }; y: { stacked?: boolean } };
        plugins: { legend: { display: boolean } };
      };
    };
    expect(config.data.datasets.map((d) => d.label)).toEqual([
      'A.rvt',
      'B.rvt',
    ]);
    expect(config.data.datasets.map((d) => d.data)).toEqual([
      [3, 1],
      [1, 1],
    ]);
    expect(config.options.scales.x.stacked).toBe(true);
    expect(config.options.scales.y.stacked).toBe(true);
    expect(config.options.plugins.legend.display).toBe(true);
  });

  it('dims an unlit category in every model', () => {
    const { rerender } = render(
      <ChartCanvas kind="bar" chart={splitChart} label="Counts" />,
    );
    const first = created.charts[0];
    rerender(
      <ChartCanvas
        kind="bar"
        chart={splitChart}
        label="Counts"
        highlight={new Set(['Walls'])}
      />,
    );
    expect(created.charts).toHaveLength(1);
    const second = first?.data.datasets[1] as { backgroundColor: string[] };
    expect(second.backgroundColor[0]).not.toEqual(second.backgroundColor[1]);
  });

  it('ignores series in a doughnut', () => {
    render(<ChartCanvas kind="doughnut" chart={splitChart} label="Share" />);
    const config = created.charts[0]?.config as {
      data: { datasets: unknown[] };
    };
    expect(config.data.datasets).toHaveLength(1);
  });
});

describe('ChartCanvas export menu', () => {
  it('offers the three exports from one labelled button', () => {
    render(<ChartCanvas kind="bar" chart={chart} label="Bar chart" />);
    fireEvent.click(screen.getByRole('button', { name: 'Export Bar chart' }));
    for (const name of ['Download PNG', 'Download CSV', 'Copy data']) {
      expect(screen.getByRole('menuitem', { name })).toBeTruthy();
    }
  });

  it('gives bars a minimum length', () => {
    render(<ChartCanvas kind="bar" chart={chart} label="Bar chart" />);
    const config = created.charts.at(-1)?.config as {
      data: { datasets: { minBarLength?: number }[] };
    };
    expect(config.data.datasets[0]?.minBarLength).toBe(2);
  });
});
