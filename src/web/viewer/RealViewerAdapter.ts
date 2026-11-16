import type { PropertyRow } from '../../shared/types.js';
import type { Theme } from '../theme/theme.js';
import {
  autodeskWindow,
  type BulkPropertyItem,
  type ControlButton,
  type ControlGroup,
  type GuiViewer3D,
  getViewing,
  type InstanceTree,
  type ViewerEvent,
} from './autodesk.js';
import { readSceneBackground } from './sceneBackground.js';
import type {
  Rgba,
  ToolbarButtonSpec,
  ViewerAdapter,
} from './ViewerAdapter.js';

const VIEWER_VERSION = '7.*';
const VIEWER_BASE = `https://developer.api.autodesk.com/modelderivative/v2/viewers/${VIEWER_VERSION}`;
const TOOLBAR_GROUP_ID = 'bim-showcase-hub-toolbar';

const VIEWER_THEMES: Record<Theme, string> = {
  dark: 'dark-theme',
  light: 'light-theme',
};

let assetsPromise: Promise<void> | null = null;
let initializedApi: string | null = null;

export type ViewerRegion = 'US' | 'EU';

export function detectRegion(urn: string): ViewerRegion {
  try {
    const padded = urn.replace(/-/g, '+').replace(/_/g, '/');
    return atob(padded).includes('emea') ? 'EU' : 'US';
  } catch {
    return 'US';
  }
}

export function apiForRegion(region: ViewerRegion): string {
  return region === 'EU' ? 'derivativeV2_EU' : 'derivativeV2';
}

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
  if (!res.ok) throw new Error(`Token request failed (${res.status})`);
  return (await res.json()) as TokenResponse;
}

function initializeViewing(api: string): Promise<void> {
  if (initializedApi === api) return Promise.resolve();
  return new Promise((resolve) => {
    getViewing().Initializer(
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
      () => {
        initializedApi = api;
        resolve();
      },
    );
  });
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
  private readonly pendingButtons = new Map<string, ToolbarButtonSpec>();
  private readonly mountedButtons = new Map<
    string,
    { group: ControlGroup; button: ControlButton }
  >();
  private readonly onSelection = (ev: ViewerEvent) => {
    const ids = ev.dbIdArray ?? [];
    for (const cb of this.selectionListeners) cb([...ids]);
  };
  private readonly onToolbar = () => this.mountPending();

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
    viewer.addEventListener(viewing.TOOLBAR_CREATED_EVENT, this.onToolbar);
    const startCode = viewer.start();
    if (startCode) throw new Error(`Viewer failed to start (${startCode})`);
    this.applyTheme(viewer);
    this.mountPending();
    const doc = await loadDocument(urn);
    if (this.destroyed || this.viewer !== viewer) return;
    await viewer.loadDocumentNode(doc, doc.getRoot().getDefaultGeometry());
    if (this.viewer === viewer) this.applyTheme(viewer);
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
      viewer.removeEventListener(viewing.TOOLBAR_CREATED_EVENT, this.onToolbar);
    }
    this.mountedButtons.clear();
    viewer.tearDown();
    viewer.finish();
    this.viewer = null;
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

  registerToolbarButton(spec: ToolbarButtonSpec): () => void {
    this.pendingButtons.set(spec.id, spec);
    this.mountPending();
    return () => {
      this.pendingButtons.delete(spec.id);
      const mounted = this.mountedButtons.get(spec.id);
      if (mounted) {
        mounted.group.removeControl(mounted.button);
        this.mountedButtons.delete(spec.id);
      }
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
    this.selectionListeners.clear();
    this.pendingButtons.clear();
  }

  private createButton(spec: ToolbarButtonSpec): ControlButton {
    const button = new (getViewing().UI.Button)(spec.id);
    button.onClick = () => spec.onClick();
    button.setToolTip(spec.tooltip);
    if (button.icon) button.icon.innerHTML = spec.icon;
    return button;
  }

  private mountPending(): void {
    const toolbar = this.viewer?.toolbar;
    if (!toolbar) return;
    let group = toolbar.getControl(TOOLBAR_GROUP_ID);
    if (!group) {
      group = new (getViewing().UI.ControlGroup)(TOOLBAR_GROUP_ID);
      toolbar.addControl(group);
    }
    for (const [id, spec] of this.pendingButtons) {
      if (this.mountedButtons.has(id)) continue;
      const button = this.createButton(spec);
      group.addControl(button);
      this.mountedButtons.set(id, { group, button });
    }
  }
}

export async function createRealViewerAdapter(
  container: HTMLElement,
): Promise<ViewerAdapter> {
  return new RealViewerAdapter(container);
}
