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
});
