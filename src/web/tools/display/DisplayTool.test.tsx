import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installMemoryStorage } from '../../test/mockApi.js';
import type {
  DisplaySettings,
  ViewerAdapter,
} from '../../viewer/ViewerAdapter.js';
import { DisplayTool } from './DisplayTool.js';
import {
  DEFAULT_DISPLAY_SETTINGS,
  DISPLAY_SETTINGS_KEY,
  sanitizeDisplaySettings,
  sanitizeDisplayToolSettings,
} from './displaySettings.js';

beforeEach(() => {
  installMemoryStorage();
});

function fakeAdapter() {
  return {
    applyDisplaySettings: vi.fn(() => []),
  } as unknown as ViewerAdapter;
}

const APPLIED = {
  lightPreset: 2,
  groundShadow: false,
  groundReflection: true,
  edges: false,
  ambientOcclusion: false,
  antialiasing: false,
  performance: true,
};

describe('sanitizeDisplayToolSettings', () => {
  it('fills missing booleans from the defaults and keeps enabled', () => {
    expect(sanitizeDisplayToolSettings(undefined)).toEqual(
      DEFAULT_DISPLAY_SETTINGS,
    );
    expect(
      sanitizeDisplayToolSettings({ enabled: false, edges: false }),
    ).toEqual({
      ...DEFAULT_DISPLAY_SETTINGS,
      enabled: false,
      edges: false,
    });
  });

  it('clamps the light preset to a known index or null', () => {
    expect(sanitizeDisplaySettings({ lightPreset: 3 }).lightPreset).toBe(3);
    expect(sanitizeDisplaySettings({ lightPreset: '4' }).lightPreset).toBe(4);
    expect(sanitizeDisplaySettings({ lightPreset: 99 }).lightPreset).toBeNull();
    expect(
      sanitizeDisplaySettings({ lightPreset: 'odd' }).lightPreset,
    ).toBeNull();
    expect(sanitizeDisplaySettings({ lightPreset: '' }).lightPreset).toBeNull();
    expect(
      sanitizeDisplaySettings({ lightPreset: null }).lightPreset,
    ).toBeNull();
  });
});

describe('DisplayTool', () => {
  it('describes the tool and its settings key', () => {
    const tool = new DisplayTool();
    expect(tool.id).toBe('display');
    expect(tool.title).toBe('Viewer display');
    expect(tool.description).toBe(
      'Lighting, shadows, edges and rendering quality.',
    );
    expect(tool.settings.key).toBe(DISPLAY_SETTINGS_KEY);
    expect(tool.form?.fields.map((field) => field.key)).toEqual([
      'lightPreset',
      'groundShadow',
      'groundReflection',
      'edges',
      'ambientOcclusion',
      'antialiasing',
      'performance',
    ]);
  });

  it('applies the settings without enabled, sanitized', () => {
    const applied = vi.fn((_settings: DisplaySettings) => [] as string[]);
    const adapter = {
      applyDisplaySettings: applied,
    } as unknown as ViewerAdapter;
    const tool = new DisplayTool();
    tool.onSettingsChanged(adapter, undefined, {
      ...DEFAULT_DISPLAY_SETTINGS,
      ...APPLIED,
      lightPreset: '2' as unknown as number,
    });
    expect(applied).toHaveBeenLastCalledWith(APPLIED);
    expect(Object.keys(applied.mock.calls[0]?.[0] as object)).not.toContain(
      'enabled',
    );
  });

  it('leaves the viewer alone while it is off', () => {
    const adapter = fakeAdapter();
    const tool = new DisplayTool();
    tool.onSettingsChanged(adapter, undefined, {
      ...DEFAULT_DISPLAY_SETTINGS,
      enabled: false,
    });
    tool.onModelsReady(adapter, {
      ...DEFAULT_DISPLAY_SETTINGS,
      enabled: false,
    });
    expect(adapter.applyDisplaySettings).not.toHaveBeenCalled();
  });

  it('reapplies on model load and resets on disable', () => {
    const adapter = fakeAdapter();
    const tool = new DisplayTool();
    tool.onModelsReady(adapter, { ...DEFAULT_DISPLAY_SETTINGS, edges: false });
    expect(adapter.applyDisplaySettings).toHaveBeenLastCalledWith({
      ...APPLIED,
      lightPreset: null,
      groundShadow: true,
      groundReflection: false,
      edges: false,
      ambientOcclusion: true,
      antialiasing: true,
      performance: false,
    });
    tool.onDisabled(adapter);
    expect(adapter.applyDisplaySettings).toHaveBeenLastCalledWith({
      lightPreset: null,
      groundShadow: true,
      groundReflection: false,
      edges: true,
      ambientOcclusion: true,
      antialiasing: true,
      performance: false,
    });
  });

  it('signs the toolbar by the applied settings', () => {
    const tool = new DisplayTool();
    expect(tool.toolbarSignature(DEFAULT_DISPLAY_SETTINGS)).not.toEqual(
      tool.toolbarSignature({ ...DEFAULT_DISPLAY_SETTINGS, edges: false }),
    );
  });
});

describe('display settings window', () => {
  it('offers the light presets and toggles the rest', () => {
    render(new DisplayTool().renderSettings());
    const preset = screen.getByRole('combobox') as HTMLSelectElement;
    expect(
      Array.from(preset.options).map((option) => option.textContent),
    ).toContain('Dark Sky');
    fireEvent.change(preset, { target: { value: '2' } });
    expect(
      JSON.parse(window.localStorage.getItem(DISPLAY_SETTINGS_KEY) ?? '{}'),
    ).toMatchObject({ lightPreset: '2' });
    fireEvent.click(screen.getByRole('switch', { name: 'Edges' }));
    expect(
      JSON.parse(window.localStorage.getItem(DISPLAY_SETTINGS_KEY) ?? '{}'),
    ).toMatchObject({ edges: false });
  });

  it('resets to the defaults', () => {
    render(new DisplayTool().renderSettings());
    fireEvent.click(screen.getByRole('switch', { name: 'Edges' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset display' }));
    expect(
      JSON.parse(window.localStorage.getItem(DISPLAY_SETTINGS_KEY) ?? '{}'),
    ).toEqual(DEFAULT_DISPLAY_SETTINGS);
  });
});
