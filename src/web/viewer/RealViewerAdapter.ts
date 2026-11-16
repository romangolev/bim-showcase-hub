import type { PropertyRow } from '../../shared/types.js';
import { notifyUnauthorized } from '../api/client.js';
import type { Theme } from '../theme/theme.js';
import {
  autodeskWindow,
  type BulkPropertyItem,
  type GuiViewer3D,
  getViewing,
  type InstanceTree,
  type ViewerEvent,
} from './autodesk.js';
import { ensureToolsExtension, TOOLS_EXTENSION_ID } from './autodeskTools.js';
import { fullscreenElementOf, watchFullscreen } from './fullscreen.js';
import { apiForRegion, detectRegion } from './region.js';
import { createResizeScheduler } from './resizeScheduler.js';
import { readSceneBackground } from './sceneBackground.js';
import { ToolGroupController } from './toolGroupController.js';
import type { Rgba, ToolGroupSpec, ViewerAdapter } from './ViewerAdapter.js';

const VIEWER_VERSION = '7.*';
const VIEWER_BASE = `https://developer.api.autodesk.com/modelderivative/v2/viewers/${VIEWER_VERSION}`;

export const SCREEN_MODE_SETTLE_MS = 400;
const FILL_BROWSER_CLASS = 'viewer-fill-browser';

const VIEWER_THEMES: Record<Theme, string> = {
  dark: 'dark-theme',
  light: 'light-theme',
};

let assetsPromise: Promise<void> | null = null;
let initialization: {
  viewing: unknown;
  api: string;
  promise: Promise<void>;
} | null = null;

export {
  apiForRegion,
  detectRegion,
  type ViewerRegion,
} from './region.js';

function injectStyle(href: string): void {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

function injectScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      reject(new Error('Could not load the Autodesk Viewer script'));
    };
    document.head.appendChild(script);
  });
}

export function loadViewerAssets(): Promise<void> {
  if (autodeskWindow().Autodesk?.Viewing) return Promise.resolve();
  if (!assetsPromise) {
    injectStyle(`${VIEWER_BASE}/style.min.css`);
    assetsPromise = injectScript(`${VIEWER_BASE}/viewer3D.min.js`).catch(
      (err: unknown) => {
        assetsPromise = null;
        throw err;
      },
    );
  }
  return assetsPromise;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

async function fetchToken(): Promise<TokenResponse> {
  const res = await fetch('/api/viewer/token');
  if (res.status === 401) notifyUnauthorized();
  if (!res.ok) throw new Error(`Token request failed (${res.status})`);
  return (await res.json()) as TokenResponse;
}

function initializeViewing(api: string): Promise<void> {
  const viewing = getViewing();
  if (initialization && initialization.viewing === viewing) {
    if (initialization.api !== api) {
      return Promise.reject(
        new Error(
          'The viewer is already initialized for another region. Reload the page to open this model.',
        ),
      );
    }
    return initialization.promise;
  }
  const promise = new Promise<void>((resolve) => {
    viewing.Initializer(
      {
        env: 'AutodeskProduction',
        api,
        getAccessToken: (callback) => {
          fetchToken().then(
            (t) => callback(t.access_token, t.expires_in),
            () => callback('', 0),
          );
        },
      },
      resolve,
    );
  });
  initialization = { viewing, api, promise };
  return promise;
}

function loadDocument(urn: string) {
  return new Promise<Parameters<GuiViewer3D['loadDocumentNode']>[0]>(
    (resolve, reject) => {
      getViewing().Document.load(`urn:${urn}`, resolve, (code, message) =>
        reject(new Error(`Document load failed (${code}): ${message}`)),
      );
    },
  );
}

function leafIds(tree: InstanceTree): number[] {
  const leaves: number[] = [];
  tree.enumNodeChildren(
    tree.getRootId(),
    (dbId) => {
      if (tree.getChildCount(dbId) === 0) leaves.push(dbId);
    },
    true,
  );
  return leaves;
}

function toPropertyValue(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
    return value;
  return String(value);
}

export class RealViewerAdapter implements ViewerAdapter {
  private viewer: GuiViewer3D | null = null;
  private destroyed = false;
  private theme: Theme = 'dark';
  private readonly selectionListeners = new Set<(ids: number[]) => void>();
  private controller: ToolGroupController | null = null;
  private toolsMounted = false;
  private modelLoaded = false;
  private started = false;
  private stopFullscreen: (() => void) | null = null;
  private frameObserver: ResizeObserver | null = null;
  private readonly onSelection = (ev: ViewerEvent) => {
    const ids = ev.dbIdArray ?? [];
    for (const cb of [...this.selectionListeners]) {
      try {
        cb([...ids]);
      } catch (err) {
        console.error(err);
      }
    }
  };
  private readonly resizer = createResizeScheduler(() => this.resize());
  private readonly onScreenChange = () => {
    this.resizer.schedule(SCREEN_MODE_SETTLE_MS);
  };
  private readonly onFullscreenChange = () => {
    this.resize();
    this.onScreenChange();
  };
  private readonly onFullscreenError = () => {
    const frame = this.viewer?.container;
    if (frame && fullscreenElementOf(this.document()) !== frame) {
      frame.classList.remove(FILL_BROWSER_CLASS);
    }
    this.onFullscreenChange();
  };

  constructor(private readonly container: HTMLElement) {}

  async load(urn: string): Promise<void> {
    await loadViewerAssets();
    if (this.destroyed) return;
    await initializeViewing(apiForRegion(detectRegion(urn)));
    if (this.destroyed) return;
    this.unload();
    const viewing = getViewing();
    const viewer = new viewing.GuiViewer3D(this.container, {
      extensions: ['Autodesk.DocumentBrowser', 'Autodesk.VisualClusters'],
    });
    this.viewer = viewer;
    viewer.addEventListener(viewing.SELECTION_CHANGED_EVENT, this.onSelection);
    let startCode: number | undefined;
    try {
      startCode = viewer.start();
    } catch (err) {
      this.abandon(viewer);
      throw err;
    }
    if (startCode) {
      this.abandon(viewer);
      throw new Error(`Viewer failed to start (${startCode})`);
    }
    this.started = true;
    this.watchScreenMode(viewer, viewing.FULLSCREEN_MODE_EVENT);
    this.applyTheme(viewer);
    const doc = await loadDocument(urn);
    if (this.destroyed || this.viewer !== viewer) return;
    await viewer.loadDocumentNode(doc, doc.getRoot().getDefaultGeometry());
    if (this.destroyed || this.viewer !== viewer) return;
    this.applyTheme(viewer);
    this.modelLoaded = true;
    await this.mountTools();
    this.resize();
  }

  resize(): void {
    const viewer = this.viewer;
    if (!viewer) return;
    const frame = this.frame();
    const width = frame.clientWidth;
    const height = frame.clientHeight;
    if (width === 0 || height === 0) return;
    for (const el of this.container.querySelectorAll<HTMLElement>(
      '.adsk-viewing-viewer',
    )) {
      if (el.parentElement !== this.container) continue;
      if (el.style.width.endsWith('px')) el.style.width = '';
      if (el.style.height.endsWith('px')) el.style.height = '';
    }
    viewer.resize();
    const canvas = viewer.canvas;
    if (
      canvas &&
      (canvas.clientWidth !== width || canvas.clientHeight !== height)
    ) {
      viewer.impl?.resize?.(width, height);
    }
  }

  unload(): void {
    const viewer = this.viewer;
    if (!viewer) return;
    const viewing = autodeskWindow().Autodesk?.Viewing;
    if (viewing) {
      viewer.removeEventListener(
        viewing.SELECTION_CHANGED_EVENT,
        this.onSelection,
      );
      if (viewing.FULLSCREEN_MODE_EVENT) {
        viewer.removeEventListener(
          viewing.FULLSCREEN_MODE_EVENT,
          this.onScreenChange,
        );
      }
    }
    this.unwatchScreenMode();
    this.toolsMounted = false;
    this.modelLoaded = false;
    this.controller?.resetState();
    this.viewer = null;
    if (!this.started) {
      this.removeFrame(viewer);
      return;
    }
    this.started = false;
    viewer.tearDown();
    viewer.finish();
  }

  private abandon(viewer: GuiViewer3D): void {
    const viewing = autodeskWindow().Autodesk?.Viewing;
    if (viewing) {
      viewer.removeEventListener(
        viewing.SELECTION_CHANGED_EVENT,
        this.onSelection,
      );
    }
    if (this.viewer === viewer) this.viewer = null;
    this.removeFrame(viewer);
  }

  private removeFrame(viewer: GuiViewer3D): void {
    const frame = viewer.container;
    if (frame && frame !== this.container && frame.parentNode) {
      frame.parentNode.removeChild(frame);
    }
  }

  getSelection(): number[] {
    return this.viewer ? [...this.viewer.getSelection()] : [];
  }

  clearSelection(): void {
    this.viewer?.clearSelection();
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
    if (this.viewer) this.applyTheme(this.viewer);
  }

  private applyTheme(viewer: GuiViewer3D): void {
    viewer.setTheme(VIEWER_THEMES[this.theme]);
    viewer.setBackgroundColor(...readSceneBackground());
  }

  setThemingColor(ids: number[], color: Rgba): void {
    const viewer = this.viewer;
    const THREE = autodeskWindow().THREE;
    if (!viewer || !THREE) return;
    const vector = new THREE.Vector4(color[0], color[1], color[2], color[3]);
    for (const id of ids) viewer.setThemingColor(id, vector);
  }

  clearThemingColors(): void {
    this.viewer?.clearThemingColors();
  }

  async getLeafProperties(propertyNames: string[]): Promise<PropertyRow[]> {
    const viewer = this.viewer;
    if (!viewer?.model) return [];
    const model = viewer.model;
    const tree = await new Promise<InstanceTree>((resolve, reject) =>
      viewer.getObjectTree(resolve, reject),
    );
    const ids = leafIds(tree);
    const items = await new Promise<BulkPropertyItem[]>((resolve, reject) =>
      model.getBulkProperties(
        ids,
        { propFilter: propertyNames },
        resolve,
        reject,
      ),
    );
    return items.map((item) => {
      const properties: PropertyRow['properties'] = {};
      for (const name of propertyNames) properties[name] = null;
      for (const prop of item.properties) {
        properties[prop.displayName] = toPropertyValue(prop.displayValue);
      }
      return { dbId: item.dbId, name: item.name, properties };
    });
  }

  registerToolGroup(spec: ToolGroupSpec): () => void {
    this.controller?.dispose();
    const controller = new ToolGroupController(spec, this);
    this.controller = controller;
    void this.mountTools();
    return () => {
      if (this.controller !== controller) return;
      this.unmountTools();
      controller.dispose();
      this.controller = null;
    };
  }

  onSelectionChange(cb: (ids: number[]) => void): () => void {
    this.selectionListeners.add(cb);
    return () => {
      this.selectionListeners.delete(cb);
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unload();
    this.controller?.dispose();
    this.controller = null;
    this.selectionListeners.clear();
  }

  private document(): Document {
    return this.container.ownerDocument;
  }

  private frame(): HTMLElement {
    const active = fullscreenElementOf(this.document());
    if (
      active instanceof HTMLElement &&
      active !== this.container &&
      this.container.contains(active)
    ) {
      return active;
    }
    return this.container;
  }

  private watchScreenMode(viewer: GuiViewer3D, modeEvent?: string): void {
    this.unwatchScreenMode();
    if (modeEvent) viewer.addEventListener(modeEvent, this.onScreenChange);
    this.stopFullscreen = watchFullscreen(
      this.document(),
      this.onFullscreenChange,
      this.onFullscreenError,
    );
    if (viewer.container && typeof ResizeObserver !== 'undefined') {
      this.frameObserver = new ResizeObserver(this.onScreenChange);
      this.frameObserver.observe(viewer.container);
    }
  }

  private unwatchScreenMode(): void {
    this.stopFullscreen?.();
    this.stopFullscreen = null;
    this.frameObserver?.disconnect();
    this.frameObserver = null;
    this.resizer.cancel();
  }

  scheduleResize(settleMs: number): void {
    this.resizer.schedule(settleMs);
  }

  private async mountTools(): Promise<void> {
    const viewer = this.viewer;
    const controller = this.controller;
    if (!viewer || !controller || !this.modelLoaded || this.toolsMounted) {
      return;
    }
    ensureToolsExtension();
    this.toolsMounted = true;
    try {
      await viewer.loadExtension(TOOLS_EXTENSION_ID, { controller });
    } catch {
      this.toolsMounted = false;
    }
  }

  private unmountTools(): void {
    if (!this.toolsMounted) return;
    this.toolsMounted = false;
    this.viewer?.unloadExtension(TOOLS_EXTENSION_ID);
  }
}

export async function createRealViewerAdapter(
  container: HTMLElement,
): Promise<ViewerAdapter> {
  return new RealViewerAdapter(container);
}
