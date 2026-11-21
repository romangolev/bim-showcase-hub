import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PAINT_PALETTES } from '../extensions/paintBrushes.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { act, fireEvent, render, screen } from '../test/render.js';
import { useTheme } from '../theme/ThemeContext.js';
import { ChartCanvas } from './ChartCanvas.js';
import { CHART_SETTINGS } from './chartSettings.js';

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
  vi.unstubAllGlobals();
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

describe('ChartCanvas palette and patterns', () => {
  const tile = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
  };

  it('reads the palette from the chart settings', () => {
    CHART_SETTINGS.write({
      palette: 'okabe-ito',
      patterns: false,
      dataTable: false,
    });
    render(<ChartCanvas kind="bar" chart={chart} label="Counts" />);
    const okabe = PAINT_PALETTES.find(
      (item) => item.id === 'okabe-ito',
    )?.swatches.map((swatch) => swatch.hex.toLowerCase());
    for (const color of colorsOf(0)) {
      expect(okabe).toContain(color.toLowerCase());
    }
  });

  it('fills each series with a pattern when pattern fills are on', () => {
    CHART_SETTINGS.write({
      palette: 'default',
      patterns: true,
      dataTable: false,
    });
    const pattern = { pattern: true } as unknown as CanvasPattern;
    vi.stubGlobal('OffscreenCanvas', undefined);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      ...tile,
      createPattern: () => pattern,
    } as unknown as RenderingContext);
    render(<ChartCanvas kind="bar" chart={chart} label="Counts" />);
    const colors = colorsOf(0);
    expect(colors[0]).toBeTypeOf('string');
    expect(colors[1]).toBe(pattern);
  });

  it('keeps plain colours when pattern fills are off', () => {
    render(<ChartCanvas kind="bar" chart={chart} label="Counts" />);
    const got = colorsOf(0);
    expect(got).toHaveLength(2);
    for (const color of got) expect(typeof color).toBe('string');
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
