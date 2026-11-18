import type { OpenModelsState, OpenModelsStore } from '../api/openModels.js';
import type {
  DockController,
  LayoutMode,
  MoveTarget,
  PaneTitle,
} from './layoutContext.js';
import {
  type LayoutModel,
  layoutReducer,
  type SerializedDock,
} from './layoutState.js';
import { mountedPanels } from './mounted.js';
import {
  FOLLOWERS,
  isPaneId,
  isUserInstance,
  PANE_IDS,
  type PaneId,
  type PanelId,
  paneById,
  paneKind,
  parsePanelId,
  TREE_WIDTH_DEFAULT,
} from './paneRegistry.js';
import { MODEL_KIND, modelPanelId } from './panes.js';
import {
  addUserInstance,
  removeUserInstance,
  type UserInstances,
  userInstanceIds,
} from './userInstances.js';

const MOVE_MESSAGES: Partial<Record<MoveTarget, string>> = {
  left: 'moved to the left edge',
  right: 'moved to the right edge',
  below: 'moved to the bottom',
};

export interface LifecycleState {
  layout: LayoutModel;
  user: UserInstances;
  locked: boolean;
  openPanes: readonly PaneId[];
  attached: readonly PanelId[];
  signals: Readonly<Record<PanelId, number>>;
  overlayTreeOpen: boolean;
  maximized: PanelId | null;
  presenting: boolean;
  resizing: PanelId | null;
  announcement: string;
}

export interface LifecycleView {
  instances: PanelId[];
  userPanels: PanelId[];
  companions: PaneId[];
  home: boolean;
  overlayOpen: boolean;
  treeOpen: boolean;
  canAddInstance: boolean;
  mounted: PanelId[];
}

export interface LifecycleDeps {
  models: Pick<
    OpenModelsStore,
    'getState' | 'activate' | 'close' | 'show' | 'setVisible'
  >;
  dock: () => DockController | null;
  mode: () => LayoutMode;
  hosts: { release: (id: PanelId) => void };
  persist: {
    user: (next: UserInstances) => void;
    locked: (next: boolean) => void;
  };
  settings: {
    seed: (id: PanelId, activeModel: string | null) => void;
    forget: (id: PanelId) => void;
  };
  focus: {
    treeInput: () => void;
    treeTarget: () => void;
    toggle: () => void;
  };
  later: (run: () => void) => void;
  title: (id: PanelId) => PaneTitle;
  initial: { layout: LayoutModel; user: UserInstances; locked: boolean };
}

export interface PaneLifecycle {
  subscribe: (listener: () => void) => () => void;
  getState: () => LifecycleState;
  view: () => LifecycleView;
  sync: (external: { user?: UserInstances; locked?: boolean }) => void;
  reconcile: () => void;
  modeChanged: () => void;
  activateInstance: (id: PanelId) => void;
  closeInstance: (id: PanelId) => void;
  addInstance: (kind: PaneId) => PanelId | null;
  togglePane: (id: PanelId) => void;
  closePane: (id: PaneId) => void;
  setCollapsed: (id: PaneId, collapsed: boolean) => void;
  movePane: (id: PanelId, target: MoveTarget) => void;
  resetLayout: () => void;
  setLocked: (locked: boolean) => void;
  toggleMaximize: (id: PanelId) => void;
  setPresenting: (presenting: boolean) => void;
  focusPane: (id: PanelId) => void;
  toggleTree: () => void;
  revealTree: () => void;
  closeTreeOverlay: () => void;
  floatNext: (urn: string) => void;
  startResize: (id: PanelId) => void;
  resize: (delta: { width?: number; height?: number }) => void;
  finishResize: () => void;
  paneAttached: (id: PanelId) => void;
  visibility: (id: PanelId, visible: boolean) => void;
  dockChanged: (dock: SerializedDock, open: PaneId[]) => void;
  treeWidth: (width: number) => void;
  maximizedChanged: (id: PanelId | null) => void;
  moved: (id: PanelId) => void;
}

export function modelOf(id: PanelId): string | null {
  const parsed = parsePanelId(id);
  return parsed?.kind === MODEL_KIND ? parsed.instance : null;
}

export function openFromDock(dock: SerializedDock | null): PaneId[] {
  if (!dock) return ['tree'];
  const kinds = new Set(Object.keys(dock.panels).map(paneKind));
  return PANE_IDS.filter((id) => kinds.has(id));
}

export function deriveView(
  state: LifecycleState,
  models: OpenModelsState,
  mode: LayoutMode,
): LifecycleView {
  const stacked = mode === 'stacked';
  const home = models.models.length === 0;
  const userPanels = userInstanceIds(state.user);
  const instances = [
    ...models.models.map(({ urn }) => modelPanelId(urn)),
    ...(stacked && home ? [] : userPanels),
  ];
  const companions = FOLLOWERS.filter(
    (id) => !state.layout.dismissed.includes(id),
  );
  return {
    instances,
    userPanels,
    companions,
    home,
    overlayOpen: stacked && state.overlayTreeOpen && !home,
    treeOpen: stacked
      ? home || state.overlayTreeOpen
      : !state.layout.collapsed.includes('tree'),
    canAddInstance: !home && mode === 'dock',
    mounted: mountedPanels(state.attached, {
      mode,
      open: state.openPanes,
      companions,
      onModel: models.active !== null,
      instances,
    }),
  };
}

export function createPaneLifecycle(deps: LifecycleDeps): PaneLifecycle {
  let state: LifecycleState = {
    layout: deps.initial.layout,
    user: deps.initial.user,
    locked: deps.initial.locked,
    openPanes: openFromDock(deps.initial.layout.dock),
    attached: [],
    signals: {},
    overlayTreeOpen: false,
    maximized: null,
    presenting: false,
    resizing: null,
    announcement: '',
  };
  const listeners = new Set<() => void>();
  let floatPending: string | null = null;
  let presentRestore: { previous: PanelId | null } | null = null;
  const shown = new Set<string>();
  let cached: {
    state: LifecycleState;
    models: OpenModelsState;
    mode: LayoutMode;
    view: LifecycleView;
  } | null = null;

  const set = (patch: Partial<LifecycleState>) => {
    state = { ...state, ...patch };
    for (const listener of [...listeners]) listener();
  };
  const dispatch = (action: Parameters<typeof layoutReducer>[1]) => {
    const layout = layoutReducer(state.layout, action);
    if (layout !== state.layout) set({ layout });
  };
  const announce = (message: string) =>
    set({
      announcement: state.announcement === message ? `${message} ` : message,
    });
  const bump = (id: PanelId) =>
    set({ signals: { ...state.signals, [id]: (state.signals[id] ?? 0) + 1 } });
  const setUser = (next: UserInstances) => {
    state = { ...state, user: next };
    deps.persist.user(next);
    set({});
  };
  const label = (id: PanelId) => deps.title(id).label;
  const home = () => deps.models.getState().models.length === 0;

  const closeTree = () => {
    set({ overlayTreeOpen: false });
    deps.focus.toggle();
  };

  const closePane = (id: PaneId) => {
    if (!paneById(id).closable) return;
    dispatch({ type: 'dismiss', id, dismissed: true });
    deps.dock()?.closePane(id);
  };

  const closeInstance = (id: PanelId) => {
    const urn = modelOf(id);
    if (urn) deps.models.close(urn);
    else if (isUserInstance(id)) {
      setUser(removeUserInstance(state.user, id));
      deps.settings.forget(id);
    }
  };

  const toggleMaximize = (id: PanelId) => {
    const now = deps.dock()?.toggleMaximize(id) ?? false;
    announce(`${label(id)} ${now ? 'maximized' : 'restored'}`);
    bump(id);
  };

  const setPresenting = (next: boolean) => {
    if (next === state.presenting) return;
    const dock = deps.dock();
    if (next) {
      const before = state.maximized;
      const viewerFirst = before !== null && paneKind(before) === 'viewer';
      const caused = !viewerFirst && (dock?.toggleMaximize('viewer') ?? false);
      presentRestore = caused ? { previous: before } : null;
    } else if (presentRestore) {
      const { previous } = presentRestore;
      presentRestore = null;
      dock?.toggleMaximize('viewer');
      if (previous) dock?.toggleMaximize(previous);
    }
    set({ presenting: next });
    announce(next ? 'Presentation mode on' : 'Presentation mode off');
    bump('viewer');
  };

  const revealTree = () => {
    if (deps.mode() === 'stacked') {
      set({ overlayTreeOpen: true });
    } else {
      dispatch({ type: 'setCollapsed', id: 'tree', collapsed: false });
      deps.dock()?.openPane('tree');
    }
    deps.focus.treeTarget();
  };

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getState: () => state,
    view: () => {
      const models = deps.models.getState();
      const mode = deps.mode();
      if (
        cached &&
        cached.state === state &&
        cached.models === models &&
        cached.mode === mode
      )
        return cached.view;
      const view = deriveView(state, models, mode);
      cached = { state, models, mode, view };
      return view;
    },
    sync: (external) => {
      const patch: Partial<LifecycleState> = {};
      if (external.user !== undefined && external.user !== state.user)
        patch.user = external.user;
      if (external.locked !== undefined && external.locked !== state.locked)
        patch.locked = external.locked;
      if (Object.keys(patch).length > 0) set(patch);
    },
    reconcile: () => {
      const wanted = new Set(
        deriveView(state, deps.models.getState(), deps.mode()).instances,
      );
      const gone = state.attached.filter(
        (id) => parsePanelId(id)?.instance && !wanted.has(id),
      );
      if (gone.length === 0) return;
      for (const id of gone) deps.hosts.release(id);
      set({ attached: state.attached.filter((id) => !gone.includes(id)) });
    },
    modeChanged: () => {
      const resizing = deps.mode() === 'dock' ? state.resizing : null;
      if (state.overlayTreeOpen || resizing !== state.resizing)
        set({ overlayTreeOpen: false, resizing });
    },
    activateInstance: (id) => {
      const urn = modelOf(id);
      if (urn) deps.models.activate(urn);
    },
    closeInstance,
    addInstance: (kind) => {
      if (state.locked || deps.mode() !== 'dock') return null;
      const added = addUserInstance(state.user, kind);
      if (!added) return null;
      deps.settings.seed(added.id, deps.models.getState().active);
      setUser(added.state);
      return added.id;
    },
    togglePane: (id) => {
      if (state.locked) return;
      const urn = modelOf(id);
      if (urn) {
        deps.models.close(urn);
        return;
      }
      if (isUserInstance(id)) {
        closeInstance(id);
        return;
      }
      if (!isPaneId(id) || !paneById(id).closable) return;
      if (state.openPanes.includes(id)) {
        closePane(id);
        return;
      }
      dispatch({ type: 'dismiss', id, dismissed: false });
      deps.dock()?.openPane(id);
    },
    closePane,
    setCollapsed: (id, collapsed) => {
      if (state.locked) return;
      dispatch({ type: 'setCollapsed', id, collapsed });
      announce(`${paneById(id).title} ${collapsed ? 'collapsed' : 'expanded'}`);
    },
    movePane: (id, target) => {
      if (state.locked) return;
      const kind = paneKind(id);
      if (kind) dispatch({ type: 'setCollapsed', id: kind, collapsed: false });
      deps.dock()?.movePane(id, target);
      const message = MOVE_MESSAGES[target];
      if (message) announce(`${label(id)} ${message}`);
      deps.later(() => deps.dock()?.focusPane(id));
    },
    resetLayout: () => {
      if (state.locked) return;
      dispatch({ type: 'reset' });
      deps.dock()?.reset(TREE_WIDTH_DEFAULT);
      announce('Layout reset');
      deps.later(() => deps.dock()?.focusPane('viewer'));
    },
    setLocked: (next) => {
      state = { ...state, locked: next };
      deps.persist.locked(next);
      set({});
      announce(next ? 'Layout locked' : 'Layout unlocked');
    },
    toggleMaximize,
    setPresenting,
    focusPane: (id) => {
      if (id === 'tree') {
        revealTree();
        return;
      }
      deps.dock()?.focusPane(id);
    },
    toggleTree: () => {
      if (deps.mode() === 'stacked') {
        if (!home()) set({ overlayTreeOpen: !state.overlayTreeOpen });
        deps.focus.treeInput();
        return;
      }
      const collapsed = state.layout.collapsed.includes('tree');
      dispatch({ type: 'setCollapsed', id: 'tree', collapsed: !collapsed });
      deps.dock()?.openPane('tree');
      if (collapsed) deps.focus.treeInput();
    },
    revealTree,
    closeTreeOverlay: () => {
      if (deps.mode() === 'stacked') closeTree();
    },
    floatNext: (urn) => {
      if (state.locked || deps.mode() === 'stacked') return;
      const id = modelPanelId(urn);
      if (state.attached.includes(id)) {
        deps.dock()?.movePane(id, 'float');
        return;
      }
      floatPending = urn;
    },
    startResize: (id) => {
      if (deps.mode() !== 'dock' || state.locked) return;
      set({ resizing: id });
      announce(
        `Resizing ${label(id)}. Arrow keys change its size, Shift moves faster, Escape finishes.`,
      );
      deps.later(() => deps.dock()?.focusPane(id));
    },
    resize: (delta) => {
      const id = state.resizing;
      if (!id) return;
      const size = deps.dock()?.resizePane(id, delta);
      if (size) announce(`${label(id)} ${size.width} by ${size.height} pixels`);
    },
    finishResize: () => {
      const id = state.resizing;
      if (!id) return;
      set({ resizing: null });
      announce(`${label(id)} resize finished`);
    },
    paneAttached: (id) => {
      if (!state.attached.includes(id))
        state = { ...state, attached: [...state.attached, id] };
      bump(id);
      const urn = modelOf(id);
      if (urn && floatPending === urn) {
        floatPending = null;
        deps.later(() => deps.dock()?.movePane(id, 'float'));
      }
      if (urn) deps.models.show(urn);
    },
    visibility: (id, visible) => {
      const urn = modelOf(id);
      if (!urn) return;
      if (visible) shown.add(urn);
      else shown.delete(urn);
      deps.models.setVisible([...shown]);
    },
    dockChanged: (dock, open) => {
      const same =
        state.openPanes.length === open.length &&
        state.openPanes.every((id) => open.includes(id));
      state = {
        ...state,
        layout: layoutReducer(state.layout, { type: 'dock', dock }),
      };
      set(same ? {} : { openPanes: open });
    },
    treeWidth: (width) => dispatch({ type: 'treeWidth', width }),
    maximizedChanged: (id) => set({ maximized: id }),
    moved: bump,
  };
}
