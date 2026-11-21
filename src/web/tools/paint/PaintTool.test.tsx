import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { paintSelection } from '../../extensions/paintBrushes.js';
import { installMemoryStorage } from '../../test/mockApi.js';
import { publishActiveAdapter } from '../../viewer/activeAdapterStore.js';
import { MockViewerAdapter } from '../../viewer/MockViewerAdapter.js';
import type { ViewerAdapter } from '../../viewer/ViewerAdapter.js';
import type { ToolContext } from '../kernel/ViewerTool.js';
import { PaintTool } from './PaintTool.js';
import { recordPaint } from './paintHistory.js';
import {
  DEFAULT_PAINT_SETTINGS,
  PAINT_SETTINGS_KEY,
  type PaintSettings,
  readPaintSettings,
} from './paintSettings.js';

beforeEach(() => {
  installMemoryStorage();
});

afterEach(() => {
  publishActiveAdapter(null);
});

function stored() {
  return JSON.parse(window.localStorage.getItem(PAINT_SETTINGS_KEY) ?? '{}');
}

function context(adapter: Partial<ViewerAdapter>, suffix = ''): ToolContext {
  return {
    adapter: adapter as ViewerAdapter,
    id: (base) => (suffix ? `${base}-${suffix}` : base),
    fileName: () => '',
    current: (tool) => tool.settings.initial,
  };
}

describe('readPaintSettings', () => {
  const d = DEFAULT_PAINT_SETTINGS;
  it.each<[string, unknown, Partial<typeof d>]>([
    ['undefined', undefined, d],
    ['a string', 'x', d],
    ['an array', [1], d],
    [
      'each field validated on its own',
      {
        enabled: false,
        palette: ['#ABCDEF', 'nope', '#abcdef', '#123456'],
        intensity: 5,
      },
      {
        enabled: false,
        paletteId: 'custom',
        palette: ['#abcdef', '#123456'],
        intensity: 1,
        ghostRest: true,
      },
    ],
    ['wrongly typed fields', { enabled: 'no', palette: [], intensity: 'x' }, d],
    [
      'an old custom palette without a palette id',
      { palette: ['#112233'] },
      { paletteId: 'custom' },
    ],
    [
      'an old default palette without a palette id',
      { palette: ['#ef4444', '#22c55e', '#3b82f6'] },
      { paletteId: 'default' },
    ],
    ['a stored ghostRest false', { ghostRest: false }, { ghostRest: false }],
    ['a garbage ghostRest', { ghostRest: 'no' }, { ghostRest: true }],
    [
      'restore on open and a bounded depth',
      { restoreOnOpen: false, historyDepth: 3.4 },
      { restoreOnOpen: false, historyDepth: 3 },
    ],
    [
      'garbage restore and depth values',
      { restoreOnOpen: 'yes', historyDepth: 0 },
      { restoreOnOpen: true, historyDepth: 1 },
    ],
    ['an unbounded depth', { historyDepth: 5000 }, { historyDepth: 50 }],
    ['a non-numeric depth', { historyDepth: 'deep' }, { historyDepth: 20 }],
  ])('reads %s', (_name, input, expected) => {
    expect(readPaintSettings(input)).toMatchObject(expected);
  });
});

describe('PaintTool', () => {
  const tool = new PaintTool();

  it('describes the tool', () => {
    expect(tool.id).toBe('paint');
    expect(tool.title).toBe('Paint brushes');
    expect(tool.settings.key).toBe(PAINT_SETTINGS_KEY);
    expect(tool.settingsModal()).toMatchObject({
      id: 'tool-paint-settings',
      title: 'Paint brushes settings',
    });
  });

  it('contributes one paint control with suffixed swatch ids', () => {
    const { paint, exports } = tool.contribute(
      context({}, 'k'),
      DEFAULT_PAINT_SETTINGS,
    );
    expect(exports).toBeUndefined();
    expect(paint?.id).toBe('paint-k');
    expect(paint?.reset.id).toBe('paint-reset-k');
    expect(paint?.swatches.map((swatch) => swatch.id)).toEqual([
      'paint-ef4444-k',
      'paint-22c55e-k',
      'paint-3b82f6-k',
    ]);
    expect(new Set(paint?.swatches.map((swatch) => swatch.icon))).toEqual(
      new Set(['paint-swatch']),
    );
  });

  it('follows the custom palette and intensity', () => {
    const { paint } = tool.contribute(context({}), {
      ...DEFAULT_PAINT_SETTINGS,
      paletteId: 'custom',
      palette: ['#000000'],
      intensity: 0.8,
      ghostRest: false,
    });
    expect(paint?.swatches).toHaveLength(1);
    expect(paint?.swatches[0]?.color).toEqual([0, 0, 0, 0.8]);
  });

  it('uses a named palette over the custom swatches', () => {
    const { paint } = tool.contribute(context({}), {
      ...DEFAULT_PAINT_SETTINGS,
      paletteId: 'okabe-ito',
      palette: ['#000000'],
    });
    expect(paint?.swatches).toHaveLength(8);
    expect(paint?.swatches[0]?.swatch).toBe('#e69f00');
    expect(paint?.swatches[0]?.label).toBe(
      'Paint selected items in orange (1)',
    );
  });

  describe('ghosting', () => {
    const on = DEFAULT_PAINT_SETTINGS;
    const off = { ...DEFAULT_PAINT_SETTINGS, ghostRest: false };

    it.each<[string, PaintSettings[], boolean[]]>([
      ['claims ghosting by default', [on], [true]],
      ['releases its claim for a stored false', [off], [false]],
      ['calls the adapter when the setting changes', [on, off], [true, false]],
      ['ignores other changes', [off, { ...off, intensity: 0.5 }], [false]],
      [
        'claims ghosting again when the tool is turned off',
        [off, { ...off, enabled: false }],
        [false, true],
      ],
      [
        're-applies a stored false after the tool is turned back on',
        [{ ...off, enabled: false }, off],
        [true, false],
      ],
    ])('%s', (_name, steps, calls) => {
      const setGhosting = vi.fn();
      const adapter = { setGhosting } as unknown as ViewerAdapter;
      let previous: PaintSettings | undefined;
      for (const next of steps) {
        tool.onSettingsChanged(adapter, previous, next);
        previous = next;
      }
      expect(setGhosting.mock.calls).toEqual(calls.map((call) => [call]));
    });

    it('defaults ghosting on', () => {
      expect(DEFAULT_PAINT_SETTINGS.ghostRest).toBe(true);
    });

    it('has no adapter side effect when contributing', () => {
      const setGhosting = vi.fn();
      tool.contribute(context({ setGhosting }), off);
      expect(setGhosting).not.toHaveBeenCalled();
    });
  });

  it('paints the selection and resets through the adapter', () => {
    const adapter = {
      getModels: () => [
        {
          id: 'a',
          urn: 'a',
          name: 'A',
          version: '1',
          visible: true,
          status: 'ready' as const,
        },
      ],
      getModelSelection: vi.fn(() => [{ modelId: 'a', dbId: 1 }]),
      setModelThemingColor: vi.fn(),
      clearSelection: vi.fn(),
      clearModelThemingColors: vi.fn(),
    };
    const { paint } = tool.contribute(context(adapter), DEFAULT_PAINT_SETTINGS);
    expect(paint?.onPaint([1, 0, 0, 0.5])).toBe(true);
    expect(adapter.setModelThemingColor).toHaveBeenCalledExactlyOnceWith(
      [{ modelId: 'a', dbId: 1 }],
      [1, 0, 0, 0.5],
    );
    paint?.onReset();
    expect(adapter.clearModelThemingColors).toHaveBeenCalledExactlyOnceWith([
      { modelId: 'a', dbId: 1 },
    ]);
  });

  it('clears the colours when it is disabled', () => {
    const adapter = {
      getModels: () => [],
      getModelSelection: vi.fn(() => [{ modelId: 'a', dbId: 1 }]),
      setModelThemingColor: vi.fn(),
      clearSelection: vi.fn(),
      clearModelThemingColors: vi.fn(),
    };
    paintSelection(adapter as unknown as ViewerAdapter, [1, 0, 0, 0.5]);
    tool.onDisabled(adapter as unknown as ViewerAdapter);
    expect(adapter.clearModelThemingColors).toHaveBeenCalledOnce();
  });

  it('only rebuilds the toolbar for a palette, intensity or enabled change', () => {
    const a = tool.toolbarSignature(DEFAULT_PAINT_SETTINGS);
    expect(JSON.stringify(a)).toBe(
      JSON.stringify(tool.toolbarSignature({ ...DEFAULT_PAINT_SETTINGS })),
    );
    expect(JSON.stringify(a)).not.toBe(
      JSON.stringify(
        tool.toolbarSignature({ ...DEFAULT_PAINT_SETTINGS, intensity: 0.9 }),
      ),
    );
    expect(JSON.stringify(a)).not.toBe(
      JSON.stringify(
        tool.toolbarSignature({
          ...DEFAULT_PAINT_SETTINGS,
          paletteId: 'viridis',
        }),
      ),
    );
  });
});

describe('Paint settings window', () => {
  const renderWindow = () => render(new PaintTool().renderSettings());

  it('has the enable switch and the three default swatches', () => {
    renderWindow();
    expect(screen.getAllByLabelText(/^Swatch \d$/)).toHaveLength(3);
    const toggle = screen.getByRole('switch', { name: 'Paint brushes' });
    fireEvent.click(toggle);
    expect(stored().enabled).toBe(false);
  });

  it('edits, adds and removes swatches and persists them', () => {
    renderWindow();
    fireEvent.change(screen.getByLabelText('Swatch 1'), {
      target: { value: '#112233' },
    });
    expect(stored().palette[0]).toBe('#112233');
    fireEvent.click(screen.getByRole('button', { name: 'Add swatch' }));
    expect(stored().palette).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Remove swatch 1' }));
    expect(stored().palette).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Reset palette' }));
    expect(stored().palette[0]).toBe('#ef4444');
  });

  it('stores the chosen palette and shows numbered labels for it', () => {
    renderWindow();
    fireEvent.change(screen.getByLabelText(/Palette/), {
      target: { value: 'okabe-ito' },
    });
    expect(stored().paletteId).toBe('okabe-ito');
    const legend = screen.getByRole('region', { name: 'Active palette' });
    expect(legend).toHaveTextContent('Orange');
    expect(legend).toHaveTextContent('1');
    expect(legend).toHaveTextContent('Black');
    expect(legend).toHaveTextContent('8');
  });

  it('resets the palette choice and the custom swatches together', () => {
    renderWindow();
    fireEvent.change(screen.getByLabelText(/Palette/), {
      target: { value: 'viridis' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reset palette' }));
    expect(stored().paletteId).toBe('default');
    expect(stored().palette[0]).toBe('#ef4444');
  });

  it('stores the ghosting setting', () => {
    renderWindow();
    fireEvent.click(
      screen.getByRole('switch', { name: 'Ghost the rest when isolating' }),
    );
    expect(stored().ghostRest).toBe(false);
  });

  it('labels the slider as intensity and stores it', () => {
    renderWindow();
    fireEvent.change(screen.getByLabelText(/^Intensity/), {
      target: { value: '0.8' },
    });
    expect(stored().intensity).toBe(0.8);
  });

  it('stores restore on open and the history depth', () => {
    renderWindow();
    fireEvent.click(
      screen.getByRole('switch', { name: 'Restore paint on open' }),
    );
    expect(stored().restoreOnOpen).toBe(false);
    fireEvent.change(screen.getByLabelText(/History depth/), {
      target: { value: '5' },
    });
    fireEvent.blur(screen.getByLabelText(/History depth/));
    expect(stored().historyDepth).toBe(5);
  });

  it('shows the short history of the active viewer and undo it', async () => {
    const adapter = new MockViewerAdapter(document.createElement('div'));
    await adapter.load('urn-history', 'Model', { version: '1' });
    publishActiveAdapter(adapter);
    const [first] = await adapter.getVisible();
    if (!first) throw new Error('The mock model has no elements');
    adapter.selectModelIds([first]);
    recordPaint(adapter, [1, 0, 0, 0.5], 20);

    renderWindow();
    const section = screen.getByRole('region', { name: 'Paint history' });
    expect(section).toHaveTextContent('1 element');
    fireEvent.click(screen.getByRole('button', { name: 'Undo paint' }));
    expect(section).toHaveTextContent('No paint actions yet.');
    expect(screen.getByRole('button', { name: 'Undo paint' })).toBeDisabled();
    adapter.destroy();
  });

  it('resets the shortcut map from the settings', () => {
    renderWindow();
    fireEvent.click(screen.getByRole('button', { name: 'Reset shortcuts' }));
    expect(
      window.localStorage.getItem('bsh.commands.viewer.keys.v1'),
    ).toBeNull();
  });
});
