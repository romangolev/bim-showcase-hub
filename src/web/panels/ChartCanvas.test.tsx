import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMemoryStorage } from '../test/mockApi.js';
import { act, fireEvent, render, screen } from '../test/render.js';
import { useTheme } from '../theme/ThemeContext.js';
import { ChartCanvas } from './ChartCanvas.js';

const created = vi.hoisted(() => ({
  charts: [] as { config: unknown; destroy: ReturnType<typeof vi.fn> }[],
}));

vi.mock('chart.js', () => {
  class Chart {
    static register = vi.fn();
    static defaults = { font: {}, color: '' };
    destroy = vi.fn();
    constructor(_canvas: unknown, config: unknown) {
      created.charts.push({ config, destroy: this.destroy });
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
