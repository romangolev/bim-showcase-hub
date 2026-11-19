import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installMemoryStorage } from '../../test/mockApi.js';
import type { ViewerAdapter } from '../../viewer/ViewerAdapter.js';
import type { ToolContext } from '../kernel/ViewerTool.js';
import { PaintTool } from './PaintTool.js';
import {
  DEFAULT_PAINT_SETTINGS,
  PAINT_SETTINGS_KEY,
  readPaintSettings,
} from './paintSettings.js';

beforeEach(() => {
  installMemoryStorage();
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
  it('returns the defaults for anything that is not a record', () => {
    expect(readPaintSettings(undefined)).toEqual(DEFAULT_PAINT_SETTINGS);
    expect(readPaintSettings('x')).toEqual(DEFAULT_PAINT_SETTINGS);
    expect(readPaintSettings([1])).toEqual(DEFAULT_PAINT_SETTINGS);
  });

  it('validates each field on its own', () => {
    expect(
      readPaintSettings({
        enabled: false,
        palette: ['#ABCDEF', 'nope', '#abcdef', '#123456'],
        intensity: 5,
      }),
    ).toEqual({
      enabled: false,
      paletteId: 'custom',
      palette: ['#abcdef', '#123456'],
      intensity: 1,
      ghostRest: true,
    });
    expect(
      readPaintSettings({ enabled: 'no', palette: [], intensity: 'x' }),
    ).toEqual(DEFAULT_PAINT_SETTINGS);
  });

  it('keeps an old custom palette without a palette id', () => {
    expect(readPaintSettings({ palette: ['#112233'] }).paletteId).toBe(
      'custom',
    );
    expect(
      readPaintSettings({ palette: ['#ef4444', '#22c55e', '#3b82f6'] })
        .paletteId,
    ).toBe('default');
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
      enabled: true,
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

    it('defaults to the viewer default and leaves the viewer alone', () => {
      const setGhosting = vi.fn();
      expect(DEFAULT_PAINT_SETTINGS.ghostRest).toBe(true);
      tool.onSettingsChanged(
        { setGhosting } as unknown as ViewerAdapter,
        undefined,
        on,
      );
      expect(setGhosting).not.toHaveBeenCalled();
    });

    it('applies a stored false once when the tool first runs', () => {
      const setGhosting = vi.fn();
      tool.onSettingsChanged(
        { setGhosting } as unknown as ViewerAdapter,
        undefined,
        off,
      );
      expect(setGhosting).toHaveBeenCalledExactlyOnceWith(false);
    });

    it('calls the adapter once when the setting changes, not for other changes', () => {
      const setGhosting = vi.fn();
      const adapter = { setGhosting } as unknown as ViewerAdapter;
      tool.onSettingsChanged(adapter, on, off);
      expect(setGhosting).toHaveBeenCalledExactlyOnceWith(false);
      tool.onSettingsChanged(adapter, off, { ...off, intensity: 0.5 });
      expect(setGhosting).toHaveBeenCalledOnce();
    });

    it('re-applies a stored false after the tool is turned back on', () => {
      const setGhosting = vi.fn();
      tool.onSettingsChanged(
        { setGhosting } as unknown as ViewerAdapter,
        { ...off, enabled: false },
        off,
      );
      expect(setGhosting).toHaveBeenCalledExactlyOnceWith(false);
    });

    it('restores the viewer default when disabled', () => {
      const setGhosting = vi.fn();
      tool.onDisabled({
        setGhosting,
        clearThemingColors: vi.fn(),
      } as unknown as ViewerAdapter);
      expect(setGhosting).toHaveBeenCalledExactlyOnceWith(true);
    });

    it('has no adapter side effect when contributing', () => {
      const setGhosting = vi.fn();
      tool.contribute(context({ setGhosting }), off);
      expect(setGhosting).not.toHaveBeenCalled();
    });
  });

  it('keeps a stored ghostRest false and defaults garbage to true', () => {
    expect(readPaintSettings({ ghostRest: false }).ghostRest).toBe(false);
    expect(readPaintSettings({ ghostRest: 'no' }).ghostRest).toBe(true);
  });

  it('paints the selection and resets through the adapter', () => {
    const adapter = {
      getModelSelection: vi.fn(() => [{ modelId: 'a', dbId: 1 }]),
      setModelThemingColor: vi.fn(),
      clearSelection: vi.fn(),
      clearThemingColors: vi.fn(),
    };
    const { paint } = tool.contribute(context(adapter), DEFAULT_PAINT_SETTINGS);
    expect(paint?.onPaint([1, 0, 0, 0.5])).toBe(true);
    expect(adapter.setModelThemingColor).toHaveBeenCalledOnce();
    paint?.onReset();
    expect(adapter.clearThemingColors).toHaveBeenCalledOnce();
  });

  it('clears the colours when it is disabled', () => {
    const adapter = { clearThemingColors: vi.fn() };
    tool.onDisabled(adapter as unknown as ViewerAdapter);
    expect(adapter.clearThemingColors).toHaveBeenCalledOnce();
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
});
