import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installMemoryStorage } from '../../test/mockApi.js';
import { publishActiveAdapter } from '../../viewer/activeAdapterStore.js';
import { NATIVE_CONTROLS } from '../../viewer/nativeControls.js';
import type { ViewerAdapter } from '../../viewer/ViewerAdapter.js';
import { TOOLBAR_PROFILES } from './nativeControls.js';
import {
  MAX_HIDDEN_CONTROLS,
  sanitizeToolbarSettings,
  TOOLBAR_SETTINGS_KEY,
  ToolbarProfileTool,
} from './ToolbarProfileTool.js';

beforeEach(() => {
  installMemoryStorage();
  publishActiveAdapter(null);
});

function fakeAdapter(missing: string[] = []) {
  return {
    setHiddenControls: vi.fn(() => missing),
  } as unknown as ViewerAdapter;
}

function settings(
  overrides: Partial<ReturnType<typeof sanitizeToolbarSettings>> = {},
) {
  return { ...sanitizeToolbarSettings(undefined), ...overrides };
}

describe('toolbar profiles', () => {
  it('names only controls that the viewer module knows', () => {
    const known = new Set(NATIVE_CONTROLS.map((control) => control.id));
    for (const ids of Object.values(TOOLBAR_PROFILES)) {
      for (const id of ids) expect(known.has(id)).toBe(true);
    }
  });

  it('keeps the full profile empty and the minimal one smallest', () => {
    expect(TOOLBAR_PROFILES.full).toEqual([]);
    expect(TOOLBAR_PROFILES.minimal.length).toBeGreaterThan(
      TOOLBAR_PROFILES.present.length,
    );
  });
});

describe('sanitizeToolbarSettings', () => {
  it('falls back to full and keeps only string ids', () => {
    expect(sanitizeToolbarSettings(undefined)).toEqual({
      enabled: true,
      profile: 'full',
      hidden: [],
    });
    expect(
      sanitizeToolbarSettings({ profile: 'odd', hidden: [1, 'x'] }),
    ).toEqual({
      enabled: true,
      profile: 'full',
      hidden: ['x'],
    });
    expect(sanitizeToolbarSettings({ profile: 'custom' }).profile).toBe(
      'custom',
    );
  });

  it('caps the custom list and drops duplicates and empty ids', () => {
    const hidden = Array.from(
      { length: MAX_HIDDEN_CONTROLS + 5 },
      (_, index) => `toolbar-${index}`,
    );
    const parsed = sanitizeToolbarSettings({
      profile: 'minimal',
      hidden: [...hidden, '', 'toolbar-0', '  '],
    });
    expect(parsed.hidden).toHaveLength(MAX_HIDDEN_CONTROLS);
    expect(parsed.profile).toBe('minimal');
  });
});

describe('ToolbarProfileTool', () => {
  it('describes the tool and its settings key', () => {
    const tool = new ToolbarProfileTool();
    expect(tool.id).toBe('toolbar');
    expect(tool.title).toBe('Toolbar profile');
    expect(tool.settings.key).toBe(TOOLBAR_SETTINGS_KEY);
    expect(tool.contribute()).toEqual({});
  });

  it('applies the chosen profile and clears it when turned off', () => {
    const adapter = fakeAdapter();
    const tool = new ToolbarProfileTool();
    tool.onSettingsChanged(
      adapter,
      undefined,
      settings({ profile: 'present' }),
    );
    expect(adapter.setHiddenControls).toHaveBeenLastCalledWith(
      TOOLBAR_PROFILES.present,
    );
    tool.onSettingsChanged(
      adapter,
      undefined,
      settings({ profile: 'custom', hidden: ['toolbar-panTool'] }),
    );
    expect(adapter.setHiddenControls).toHaveBeenLastCalledWith([
      'toolbar-panTool',
    ]);
    tool.onDisabled(adapter);
    expect(adapter.setHiddenControls).toHaveBeenLastCalledWith([]);
  });

  it('leaves the viewer alone while it is off', () => {
    const adapter = fakeAdapter();
    const tool = new ToolbarProfileTool();
    tool.onSettingsChanged(
      adapter,
      undefined,
      settings({ enabled: false, profile: 'minimal' }),
    );
    tool.onModelsReady(adapter, settings({ enabled: false }));
    expect(adapter.setHiddenControls).not.toHaveBeenCalled();
  });

  it('reapplies the profile when the models finish loading', () => {
    const adapter = fakeAdapter();
    const tool = new ToolbarProfileTool();
    tool.onModelsReady(adapter, settings({ profile: 'review' }));
    expect(adapter.setHiddenControls).toHaveBeenCalledWith(
      TOOLBAR_PROFILES.review,
    );
  });

  it('signs the toolbar by the hidden ids, not the profile name', () => {
    const tool = new ToolbarProfileTool();
    const full = settings({ profile: 'full' });
    const custom = settings({ profile: 'custom', hidden: [] });
    expect(tool.toolbarSignature(full)).toEqual(tool.toolbarSignature(custom));
    expect(tool.toolbarSignature(settings({ profile: 'present' }))).not.toEqual(
      tool.toolbarSignature(full),
    );
  });
});

describe('toolbar settings window', () => {
  it('chooses a profile and a custom list', () => {
    render(new ToolbarProfileTool().renderSettings());
    const profile = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(profile, { target: { value: 'minimal' } });
    expect(
      JSON.parse(window.localStorage.getItem(TOOLBAR_SETTINGS_KEY) ?? '{}'),
    ).toEqual({ enabled: true, profile: 'minimal', hidden: [] });
    const pan = screen.getByLabelText('Pan') as HTMLInputElement;
    fireEvent.click(pan);
    expect(
      JSON.parse(window.localStorage.getItem(TOOLBAR_SETTINGS_KEY) ?? '{}')
        .hidden,
    ).toEqual(['toolbar-panTool']);
  });

  it('lists the ids the last apply could not find', () => {
    const adapter = fakeAdapter(['toolbar-nope']);
    publishActiveAdapter(adapter);
    const tool = new ToolbarProfileTool();
    tool.onSettingsChanged(adapter, undefined, settings({ profile: 'review' }));
    render(tool.renderSettings());
    expect(
      screen.getByText('Not in this viewer version: toolbar-nope'),
    ).toBeTruthy();
  });
});
