import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { autodeskWindow } from './autodesk.js';
import { RealViewerAdapter } from './RealViewerAdapter.js';

type Call = string | { background: number[] };

function installFakeViewing() {
  const calls: Call[] = [];
  class FakeViewer {
    toolbar = undefined;
    start() {
      return undefined;
    }
    setTheme(name: string) {
      calls.push(name);
    }
    setBackgroundColor(...channels: number[]) {
      calls.push({ background: channels });
    }
    setGhosting(enabled: boolean) {
      calls.push(`ghosting:${enabled}`);
    }
    setLightPreset(preset: number) {
      calls.push(`lightPreset:${preset}`);
    }
    setGroundShadow(value: boolean) {
      calls.push(`shadow:${value}`);
    }
    setDisplayEdges(value: boolean) {
      calls.push(`edges:${value}`);
    }
    setQualityLevel(ambientOcclusion: boolean, antialiasing: boolean) {
      calls.push(`quality:${ambientOcclusion}:${antialiasing}`);
    }
    setOptimizeNavigation(value: boolean) {
      calls.push(`optimize:${value}`);
    }
    setProgressiveRendering(value: boolean) {
      calls.push(`progressive:${value}`);
    }
    addEventListener() {}
    removeEventListener() {}
    loadDocumentNode() {
      calls.push('loaded');
      return Promise.resolve({});
    }
    tearDown() {}
    finish() {}
  }
  const viewing = {
    Initializer: (_options: unknown, cb: () => void) => cb(),
    GuiViewer3D: FakeViewer,
    Document: {
      load: (
        _urn: string,
        onSuccess: (doc: {
          getRoot(): { getDefaultGeometry(): unknown };
        }) => void,
      ) => onSuccess({ getRoot: () => ({ getDefaultGeometry: () => ({}) }) }),
    },
    UI: {},
    SELECTION_CHANGED_EVENT: 'selection',
    TOOLBAR_CREATED_EVENT: 'toolbar',
  };
  Object.assign(autodeskWindow(), { Autodesk: { Viewing: viewing } });
  return calls;
}

function setTokens(graphite: string, canvas: string) {
  document.documentElement.style.setProperty('--color-graphite', graphite);
  document.documentElement.style.setProperty('--color-void', canvas);
}

const DARK_BACKGROUND = { background: [19, 20, 22, 11, 12, 14] };
const LIGHT_BACKGROUND = { background: [255, 255, 255, 245, 246, 248] };

beforeEach(() => {
  setTokens('#131416', '#0b0c0e');
});

afterEach(() => {
  Reflect.deleteProperty(autodeskWindow(), 'Autodesk');
  document.documentElement.removeAttribute('style');
});

describe('RealViewerAdapter theme', () => {
  it('applies theme and scene background on start and after the model loads', async () => {
    const calls = installFakeViewing();
    const adapter = new RealViewerAdapter(document.createElement('div'));
    await adapter.load('dXJuOmFkc2s');
    expect(calls).toEqual([
      'dark-theme',
      DARK_BACKGROUND,
      'loaded',
      'dark-theme',
      DARK_BACKGROUND,
    ]);
    adapter.destroy();
  });

  it('maps themes to Autodesk names and repaints the scene on every change', async () => {
    const calls = installFakeViewing();
    const adapter = new RealViewerAdapter(document.createElement('div'));
    await adapter.load('dXJuOmFkc2s');
    calls.length = 0;
    setTokens('#ffffff', '#f5f6f8');
    adapter.setTheme('light');
    expect(calls).toEqual(['light-theme', LIGHT_BACKGROUND]);
    calls.length = 0;
    setTokens('#131416', '#0b0c0e');
    adapter.setTheme('dark');
    expect(calls).toEqual(['dark-theme', DARK_BACKGROUND]);
    adapter.destroy();
  });

  it('applies a theme chosen before the viewer exists right after start', async () => {
    const calls = installFakeViewing();
    setTokens('#ffffff', '#f5f6f8');
    const adapter = new RealViewerAdapter(document.createElement('div'));
    adapter.setTheme('light');
    expect(calls).toEqual([]);
    await adapter.load('dXJuOmFkc2s');
    expect(calls.slice(0, 2)).toEqual(['light-theme', LIGHT_BACKGROUND]);
    adapter.destroy();
  });

  it('forwards ghosting to the viewer', async () => {
    const calls = installFakeViewing();
    const adapter = new RealViewerAdapter(document.createElement('div'));
    await adapter.load('dXJuOmFkc2s');
    calls.length = 0;
    adapter.setGhosting(true);
    adapter.setGhosting(false);
    expect(calls).toEqual(['ghosting:true', 'ghosting:false']);
    adapter.destroy();
  });

  it('reapplies the theme background after a light preset', async () => {
    const calls = installFakeViewing();
    const adapter = new RealViewerAdapter(document.createElement('div'));
    await adapter.load('dXJuOmFkc2s');
    calls.length = 0;
    expect(
      adapter.applyDisplaySettings({
        lightPreset: 2,
        groundShadow: false,
        groundReflection: true,
        edges: true,
        ambientOcclusion: false,
        antialiasing: true,
        performance: true,
      }),
    ).toEqual(['groundReflection']);
    expect(calls).toEqual([
      'lightPreset:2',
      'dark-theme',
      DARK_BACKGROUND,
      'shadow:false',
      'edges:true',
      'quality:false:true',
      'optimize:true',
      'progressive:false',
    ]);
    adapter.destroy();
  });

  it('does not touch the theme without a light preset', async () => {
    const calls = installFakeViewing();
    const adapter = new RealViewerAdapter(document.createElement('div'));
    await adapter.load('dXJuOmFkc2s');
    calls.length = 0;
    expect(
      adapter.applyDisplaySettings({
        lightPreset: null,
        groundShadow: true,
        groundReflection: false,
        edges: true,
        ambientOcclusion: true,
        antialiasing: true,
        performance: false,
      }),
    ).toEqual(['groundReflection']);
    expect(calls).toEqual([
      'shadow:true',
      'edges:true',
      'quality:true:true',
      'optimize:false',
      'progressive:true',
    ]);
    adapter.destroy();
  });
});
