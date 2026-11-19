import {
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useSession } from '../api/hooks.js';
import { modelTabTitle } from '../api/modelTitles.js';
import {
  claimModels,
  createOpenModelsStore,
  type ModelOwner,
  type OpenModelsState,
  type OpenModelsStore,
  ownerKey,
} from '../api/openModels.js';
import { OpenModelsContext } from '../api/useOpenModels.js';
import { TopBar } from '../components/TopBar.js';
import { TreeControlContext } from '../components/TreeControl.js';
import { useMediaQuery } from '../components/useMediaQuery.js';
import { ModelRouteSync } from '../routes/ModelRouteSync.js';
import {
  BSH_KEYS,
  defineRecord,
  FORGET_EVENT,
  usePersisted,
} from '../storage.js';
import { isMockViewer, ViewerProvider } from '../viewer/index.js';
import {
  forgetInstanceSetting,
  seedInstanceSetting,
} from './instanceSettings.js';
import { LayoutCommands } from './LayoutCommands.js';
import {
  type DockController,
  type LayoutApi,
  LayoutContext,
  type LayoutMode,
  MainContentContext,
  type PaneTitle,
  type PaneTitles,
} from './layoutContext.js';
import { decodeShare, shareLinkFor, shareParamIn } from './layoutShare.js';
import {
  defaultModel,
  type LayoutModel,
  readLayout,
  writeLayout,
} from './layoutState.js';
import { PaneActions } from './PaneMenu.js';
import { LayoutMenu } from './PanesMenu.js';
import { PresentControls } from './PresentControls.js';
import {
  type PaneAppearances,
  paneTags,
  readPaneAppearances,
  replacePaneAppearances,
  usePaneAppearances,
  withPaneTitles,
} from './paneAppearance.js';
import { createPaneLifecycle, type PaneLifecycle } from './paneLifecycle.js';
import {
  definitionOf,
  FOLLOWERS,
  type PanelId,
  paneById,
  paneKind,
  parsePanelId,
} from './paneRegistry.js';
import { modelPanelId } from './panes.js';
import { StackedLayout } from './StackedLayout.js';
import {
  sanitizeUserInstances,
  type UserInstances,
  userInstanceIds,
  userInstanceTitles,
} from './userInstances.js';
import { createHostStore, PaneHosts } from './ViewerHost.js';
import { WorkspaceSwitcher } from './WorkspaceSwitcher.js';
import { downloadText, writeClipboard } from './workspaceFiles.js';
import {
  activeNameOf,
  PRESETS,
  parseWorkspace,
  removeWorkspace,
  renameWorkspace,
  saveWorkspace,
  serializeWorkspace,
  WORKSPACES_RECORD,
  type WorkspaceApi,
  type WorkspaceDialog,
  workspaceFileName,
} from './workspaces.js';

const DockLayout = lazy(() =>
  import('./DockLayout.js').then((module) => ({
    default: module.DockLayout,
  })),
);

export const STACKED_MAX_WIDTH = 875;
export const STACKED_QUERY = `(max-width: ${STACKED_MAX_WIDTH}px)`;
export const LAYOUT_WRITE_DELAY_MS = 300;
export const LOCK_KEY = BSH_KEYS.preference.layoutLocked;

const LOCKED = defineRecord<boolean>({
  key: LOCK_KEY,
  initial: false,
  sanitize: (raw) => raw === true,
});

const USER_INSTANCES = defineRecord<UserInstances>({
  key: BSH_KEYS.personal.layoutInstances,
  initial: {},
  sanitize: sanitizeUserInstances,
});
export const RESIZE_STEP = 16;
export const RESIZE_STEP_FAST = 64;

const RESIZE_KEYS: Record<
  string,
  (step: number) => { width?: number; height?: number }
> = {
  ArrowRight: (step) => ({ width: step }),
  ArrowLeft: (step) => ({ width: -step }),
  ArrowDown: (step) => ({ height: step }),
  ArrowUp: (step) => ({ height: -step }),
};

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function initialModel(openPanels: readonly PanelId[]): LayoutModel {
  const store = storage();
  return store ? readLayout(store, openPanels) : defaultModel();
}

function focusTreeTarget() {
  requestAnimationFrame(() => {
    const target =
      document.querySelector<HTMLElement>(
        '#document-panel [aria-selected="true"]',
      ) ?? document.querySelector<HTMLElement>('#document-panel input');
    target?.focus();
    target?.scrollIntoView({ block: 'nearest' });
  });
}

function titlesFor(models: OpenModelsState): PaneTitles {
  const titles: Record<PanelId, PaneTitle> = {};
  for (const { urn, context, spread } of models.models) {
    titles[modelPanelId(urn)] = modelTabTitle(urn, context, undefined, spread);
  }
  const active = models.active ? titles[modelPanelId(models.active)] : null;
  if (active) {
    for (const id of FOLLOWERS) {
      const label = paneById(id).title;
      titles[id] = { label, tooltip: `${label} of ${active.label}` };
    }
  }
  return titles;
}

function paneTitleIn(titles: PaneTitles, id: PanelId): PaneTitle {
  return (
    titles[id] ?? {
      label: paneKind(id) ? definitionOf(id).title : id,
      tooltip: '',
    }
  );
}

export function useOwnedModels(
  owner: ModelOwner | null,
  provided?: OpenModelsStore,
  onOwnerChange?: () => void,
): OpenModelsStore {
  const [store] = useState(() => provided ?? createOpenModelsStore());
  const claimed = useRef<string | null>(null);
  const change = useRef(onOwnerChange);
  change.current = onOwnerChange;
  const key = owner ? ownerKey(owner) : '';
  const id = owner?.id;
  const name = owner?.name;
  useLayoutEffect(() => {
    if (!key || claimed.current === key) return;
    claimed.current = key;
    if (!claimModels({ id, name: name ?? '' })) return;
    store.clear();
    change.current?.();
  }, [key, id, name, store]);
  return store;
}

export function useDebouncedWrite(model: LayoutModel) {
  const pending = useRef<LayoutModel | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    const next = pending.current;
    pending.current = null;
    const store = storage();
    if (next && store) writeLayout(store, next);
  }, []);
  useEffect(() => {
    const drop = () => {
      clearTimeout(timer.current);
      timer.current = undefined;
      pending.current = null;
    };
    window.addEventListener(FORGET_EVENT, drop);
    return () => window.removeEventListener(FORGET_EVENT, drop);
  }, []);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    pending.current = model;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, LAYOUT_WRITE_DELAY_MS);
  }, [model, flush]);
  useEffect(() => {
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flush]);
}

export interface LayoutProviderProps {
  main: ReactNode;
  openModels?: OpenModelsStore;
}

export function LayoutProvider({ main, openModels }: LayoutProviderProps) {
  const user = useSession().data;
  const ownerId = user?.id;
  const ownerName = user?.name ?? '';
  const lifecycleRef = useRef<PaneLifecycle | null>(null);
  const modelStore = useOwnedModels(
    ownerName ? { id: ownerId, name: ownerName } : null,
    openModels,
    () => lifecycleRef.current?.forgetOwner(),
  );
  const models = useSyncExternalStore(
    modelStore.subscribe,
    modelStore.getState,
    modelStore.getState,
  );
  const stacked = useMediaQuery(STACKED_QUERY);
  const mode: LayoutMode = stacked ? 'stacked' : 'dock';
  const [userState, setUserState] = usePersisted(USER_INSTANCES);
  const [locked, setLockedState] = usePersisted(LOCKED);
  const [workspaces, setWorkspaces] = usePersisted(WORKSPACES_RECORD);
  const [activeWorkspace, setActiveWorkspace] = useState<string | null>(null);
  const [workspaceDialog, setWorkspaceDialog] = useState<WorkspaceDialog>(null);
  const undoAppearances = useRef<PaneAppearances | null>(null);
  const appearances = usePaneAppearances();
  const [hosts] = useState(() => createHostStore<PanelId>());
  const controller = useRef<DockController | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const titlesRef = useRef<PaneTitles>({});
  const setters = useRef({ setUserState, setLockedState });
  setters.current = { setUserState, setLockedState };

  const [lifecycle] = useState(() => {
    const initialInstances = [
      ...models.models.map(({ urn }) => modelPanelId(urn)),
      ...(stacked && models.models.length === 0
        ? []
        : userInstanceIds(userState)),
    ];
    return createPaneLifecycle({
      models: modelStore,
      dock: () => controller.current,
      mode: () => modeRef.current,
      hosts,
      persist: {
        user: (next) => setters.current.setUserState(next),
        locked: (next) => setters.current.setLockedState(next),
      },
      settings: { seed: seedInstanceSetting, forget: forgetInstanceSetting },
      focus: {
        treeInput: () =>
          requestAnimationFrame(() => {
            document
              .querySelector<HTMLElement>('#document-panel input')
              ?.focus();
          }),
        treeTarget: focusTreeTarget,
        toggle: () => toggleRef.current?.focus(),
      },
      later: (run) => requestAnimationFrame(run),
      title: (id) => paneTitleIn(titlesRef.current, id),
      initial: {
        layout: initialModel(initialInstances),
        user: userState,
        locked,
      },
    });
  });
  lifecycleRef.current = lifecycle;
  const state = useSyncExternalStore(
    lifecycle.subscribe,
    lifecycle.getState,
    lifecycle.getState,
  );
  const view = lifecycle.view();
  const { instances, userPanels, companions, overlayOpen, treeOpen } = view;
  const { layout: model, openPanes, presenting, maximized, resizing } = state;
  const activeInstance = models.active ? modelPanelId(models.active) : null;
  const titles = useMemo(
    () =>
      withPaneTitles(
        { ...titlesFor(models), ...userInstanceTitles(state.user) },
        appearances,
      ),
    [models, state.user, appearances],
  );
  const tags = useMemo(() => paneTags(appearances), [appearances]);
  titlesRef.current = titles;

  useLayoutEffect(() => {
    lifecycle.sync({ user: userState, locked });
  }, [lifecycle, userState, locked]);

  useDebouncedWrite(model);

  const applyBlocker = () =>
    lifecycle.getState().locked
      ? 'Unlock the layout first.'
      : modeRef.current !== 'dock'
        ? 'Open the dock layout to apply this.'
        : null;

  const shareRead = useRef(false);
  useEffect(() => {
    if (shareRead.current) return;
    shareRead.current = true;
    const param = shareParamIn(window.location.hash);
    if (!param) return;
    const url = new URL(window.location.href);
    url.hash = '';
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${url.search}`,
    );
    void decodeShare(param).then((text) => {
      if (!text) {
        lifecycle.notify('This share link is not a readable layout.');
        return;
      }
      const parsed = parseWorkspace(text);
      if ('error' in parsed) {
        lifecycle.notify(parsed.error);
        return;
      }
      const blocked = applyBlocker();
      if (blocked) {
        lifecycle.notify(blocked);
        return;
      }
      const shared = parsed.workspace.appearances;
      if (Object.keys(shared).length > 0) {
        undoAppearances.current = readPaneAppearances();
        replacePaneAppearances(shared);
      }
      lifecycle.applyWorkspace(
        { layout: parsed.workspace.layout },
        parsed.workspace.name,
      );
    });
  }, [lifecycle]);

  const workspaceApi = useMemo<WorkspaceApi>(() => {
    const { notify, getState } = lifecycle;
    const exportText = () =>
      serializeWorkspace({
        name: activeNameOf(workspaces.items, activeWorkspace) ?? 'Layout',
        layout: model,
        appearances,
      });
    const applyLayout = (
      layout: LayoutModel,
      name: string,
      nextAppearances: PaneAppearances | null,
    ): string | null => {
      const blocked = applyBlocker();
      if (blocked) return blocked;
      const travels =
        nextAppearances !== null && Object.keys(nextAppearances).length > 0;
      undoAppearances.current = travels ? appearances : null;
      if (travels && nextAppearances) replacePaneAppearances(nextAppearances);
      lifecycle.applyWorkspace({ layout }, name);
      return null;
    };
    return {
      presets: PRESETS,
      items: workspaces.items,
      active: activeWorkspace,
      canRevert: state.canRevert,
      locked: state.locked,
      canPresent: view.canPresent,
      dialog: workspaceDialog,
      openDialog: (dialog) => setWorkspaceDialog(dialog),
      closeDialog: () => setWorkspaceDialog(null),
      applyPreset: (id) => {
        const preset = PRESETS.find((entry) => entry.id === id);
        if (!preset) return;
        if (preset.id === 'present') {
          lifecycle.setPresenting(!getState().presenting);
          return;
        }
        const blocked = applyBlocker();
        if (blocked) {
          notify(blocked);
          return;
        }
        undoAppearances.current = null;
        lifecycle.applyWorkspace(
          {
            steps: preset.steps,
            collapsed: preset.collapsed,
            dismissed: preset.dismissed,
          },
          preset.name,
        );
        setActiveWorkspace(`preset:${preset.id}`);
      },
      applySaved: (id) => {
        const item = workspaces.items.find((entry) => entry.id === id);
        if (!item) return;
        const blocked = applyLayout(item.layout, item.name, item.appearances);
        if (blocked) {
          notify(blocked);
          return;
        }
        setActiveWorkspace(item.id);
      },
      save: (name) => {
        const result = saveWorkspace(workspaces, name, model, appearances);
        if (!result) return null;
        if ('error' in result) {
          notify('Workspace limit reached. Delete one first.');
          return null;
        }
        const replaced = workspaces.items.some(
          (item) => item.id === result.workspace.id,
        );
        setWorkspaces(result.store);
        setActiveWorkspace(result.workspace.id);
        notify(
          `Workspace ${result.workspace.name} ${replaced ? 'replaced' : 'saved'}`,
        );
        return result.workspace;
      },
      rename: (id, name) => {
        const next = renameWorkspace(workspaces, id, name);
        if (next === workspaces) return false;
        setWorkspaces(next);
        notify('Workspace renamed');
        return true;
      },
      remove: (id) => {
        setWorkspaces(removeWorkspace(workspaces, id));
        if (activeWorkspace === id) setActiveWorkspace(null);
        notify('Workspace deleted');
      },
      revert: () => {
        if (!getState().canRevert) return;
        if (undoAppearances.current) {
          replacePaneAppearances(undoAppearances.current);
          undoAppearances.current = null;
        }
        lifecycle.revertWorkspace();
        setActiveWorkspace(null);
      },
      importText: (text) => {
        const parsed = parseWorkspace(text);
        if ('error' in parsed) return parsed.error;
        const blocked = applyLayout(
          parsed.workspace.layout,
          parsed.workspace.name,
          parsed.workspace.appearances,
        );
        if (blocked) return blocked;
        setActiveWorkspace(null);
        setWorkspaceDialog(null);
        notify(`Layout ${parsed.workspace.name} imported`);
        return null;
      },
      exportText,
      download: () => {
        const name = activeNameOf(workspaces.items, activeWorkspace);
        const saved = downloadText(workspaceFileName(name), exportText());
        notify(saved ? 'Workspace downloaded' : 'Downloads are unavailable');
      },
      copyJson: () => {
        void writeClipboard(exportText()).then((copied) =>
          notify(
            copied
              ? 'Workspace JSON copied'
              : 'Clipboard is unavailable; use Download layout',
          ),
        );
      },
      copyLink: () => {
        void (async () => {
          const text = exportText();
          const link = await shareLinkFor(window.location.href, text);
          if (!link) {
            const copied = await writeClipboard(text);
            notify(
              copied
                ? 'Layout too long for a link; workspace JSON copied instead'
                : 'Layout too long for a link; use Download layout',
            );
            return;
          }
          const copied = await writeClipboard(link);
          notify(
            copied
              ? 'Share link copied'
              : 'Clipboard is unavailable; use Download layout',
          );
        })();
      },
    };
  }, [
    lifecycle,
    workspaces,
    activeWorkspace,
    state.canRevert,
    state.locked,
    view.canPresent,
    workspaceDialog,
    model,
    appearances,
    setWorkspaces,
  ]);

  const instanceKey = instances.join('\n');
  useEffect(() => {
    lifecycle.reconcile();
  }, [lifecycle, instanceKey]);

  const previousMode = useRef(mode);
  const focusBeforeSwitch = useRef<Element | null>(null);
  const [seenMode, setSeenMode] = useState(mode);
  if (seenMode !== mode) {
    focusBeforeSwitch.current = document.activeElement;
    setSeenMode(mode);
  }
  useLayoutEffect(() => {
    const was = previousMode.current;
    previousMode.current = mode;
    if (was === mode) return;
    lifecycle.modeChanged();
    const focused = focusBeforeSwitch.current;
    focusBeforeSwitch.current = null;
    if (!(focused instanceof HTMLElement)) return;
    const inTree = Boolean(focused.closest('#document-panel'));
    if (mode === 'stacked' && inTree) {
      toggleRef.current?.focus();
    } else if (focused.isConnected && document.activeElement !== focused) {
      focused.focus();
    }
  }, [mode, lifecycle]);

  useEffect(() => {
    if (!overlayOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented)
        lifecycle.closeTreeOverlay();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [overlayOpen, lifecycle]);

  const onController = useCallback(
    (next: DockController | null) => {
      controller.current = next;
      if (next) lifecycle.controllerReady();
    },
    [lifecycle],
  );

  const treeControl = useMemo(
    () => ({ reveal: lifecycle.revealTree }),
    [lifecycle],
  );

  const paneTitle = useCallback(
    (id: PanelId): PaneTitle => paneTitleIn(titles, id),
    [titles],
  );

  const api = useMemo<LayoutApi>(
    () => ({
      mode,
      openPanes,
      isOpen: (id) => openPanes.includes(id),
      isCollapsed: (id) => model.collapsed.includes(id),
      setCollapsed: lifecycle.setCollapsed,
      canAddInstance: view.canAddInstance,
      canPresent: view.canPresent,
      addInstance: lifecycle.addInstance,
      togglePane: lifecycle.togglePane,
      movePane: lifecycle.movePane,
      resetLayout: lifecycle.resetLayout,
      locked: state.locked,
      setLocked: lifecycle.setLocked,
      maximized,
      toggleMaximize: lifecycle.toggleMaximize,
      presenting,
      setPresenting: lifecycle.setPresenting,
      focusPane: lifecycle.focusPane,
      resizeSignal: (id) => state.signals[id] ?? 0,
      location: (id) => controller.current?.location(id) ?? null,
      startResize: lifecycle.startResize,
      resizing,
      closeTreeOverlay: lifecycle.closeTreeOverlay,
      floatNext: lifecycle.floatNext,
      paneTitle,
      workspaces: workspaceApi,
      notify: lifecycle.notify,
    }),
    [
      lifecycle,
      mode,
      openPanes,
      model.collapsed,
      view.canAddInstance,
      view.canPresent,
      state.locked,
      state.signals,
      maximized,
      presenting,
      resizing,
      paneTitle,
      workspaceApi,
    ],
  );

  useEffect(() => {
    document.documentElement.toggleAttribute('data-presenting', presenting);
    if (!presenting) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest('input, textarea, select, [role="menu"]')
      )
        return;
      lifecycle.setPresenting(false);
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.documentElement.removeAttribute('data-presenting');
    };
  }, [presenting, lifecycle]);

  useEffect(() => {
    if (!maximized || presenting) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest('input, textarea, select, [role="menu"]')
      )
        return;
      lifecycle.toggleMaximize(maximized);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [maximized, presenting, lifecycle]);

  useEffect(() => {
    if (!resizing) return;
    const onKey = (event: KeyboardEvent) => {
      const step = event.shiftKey ? RESIZE_STEP_FAST : RESIZE_STEP;
      const delta = RESIZE_KEYS[event.key]?.(step);
      if (delta) {
        event.preventDefault();
        event.stopPropagation();
        lifecycle.resize(delta);
        return;
      }
      if (
        event.key === 'Escape' ||
        event.key === 'Enter' ||
        event.key === 'Tab'
      ) {
        if (event.key !== 'Tab') event.preventDefault();
        event.stopPropagation();
        lifecycle.finishResize();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [resizing, lifecycle]);

  useEffect(() => {
    if (!import.meta.env.DEV || !isMockViewer()) return;
    const target = window as unknown as Record<string, unknown>;
    target.__bshLayout = {
      movePane: api.movePane,
      togglePane: api.togglePane,
      addInstance: api.addInstance,
      setCollapsed: api.setCollapsed,
      resetLayout: api.resetLayout,
      openPanes: () => [...api.openPanes],
      location: api.location,
      mode: () => api.mode,
      read: () => lifecycle.getState().layout,
      models: () => modelStore.getState(),
      activateModel: modelStore.activate,
      closeModel: modelStore.close,
      workspaces: () => api.workspaces,
    };
    return () => {
      delete target.__bshLayout;
    };
  }, [api, modelStore, lifecycle]);

  const renderPane = useCallback((id: PanelId) => {
    const parsed = parsePanelId(id);
    if (!parsed) return null;
    const pane = paneById(parsed.kind);
    if (parsed.instance && pane.instances) {
      const Instance = pane.instances.component;
      return <Instance instance={parsed.instance} />;
    }
    const Component = pane.component;
    return Component ? <Component /> : null;
  }, []);

  return (
    <OpenModelsContext.Provider value={modelStore}>
      <LayoutContext.Provider value={api}>
        <MainContentContext.Provider value={main}>
          <TreeControlContext.Provider value={treeControl}>
            <ViewerProvider active={models.active}>
              <ModelRouteSync />
              <LayoutCommands />
              <TopBar
                treeOpen={treeOpen}
                onToggleTree={lifecycle.toggleTree}
                toggleRef={toggleRef}
                actions={
                  <>
                    <WorkspaceSwitcher />
                    <LayoutMenu />
                  </>
                }
              />
              {stacked ? (
                <StackedLayout
                  hosts={hosts}
                  open={companions}
                  titles={titles}
                  tags={tags}
                  models={models}
                  onSelectModel={modelStore.activate}
                  onCloseModel={modelStore.close}
                  onAttach={lifecycle.paneAttached}
                  onVisibility={lifecycle.visibility}
                  treeOpen={overlayOpen}
                  onCloseTree={lifecycle.closeTreeOverlay}
                  userPanels={userPanels}
                />
              ) : (
                <div className="app-body app-body--dock">
                  <Suspense
                    fallback={
                      <p className="app-loading" role="status">
                        Loading layout
                      </p>
                    }
                  >
                    <DockLayout
                      hosts={hosts}
                      dock={model.dock}
                      treeWidth={model.treeWidth}
                      collapsed={model.collapsed}
                      titles={titles}
                      tags={tags}
                      instances={instances}
                      activeInstance={activeInstance}
                      companions={companions}
                      arrangement={model.lastViewerArrangement}
                      onAttach={lifecycle.paneAttached}
                      onVisibility={lifecycle.visibility}
                      onMoved={lifecycle.moved}
                      onChange={lifecycle.dockChanged}
                      onTreeWidth={lifecycle.treeWidth}
                      onController={onController}
                      onActivateInstance={lifecycle.activateInstance}
                      onCloseInstance={lifecycle.closeInstance}
                      onClosePane={lifecycle.closePane}
                      locked={state.locked}
                      onToggleMaximize={lifecycle.toggleMaximize}
                      onMaximized={lifecycle.maximizedChanged}
                      headerActions={({ pane }) => <PaneActions pane={pane} />}
                    />
                  </Suspense>
                </div>
              )}
              {presenting ? (
                <PresentControls
                  onExit={() => lifecycle.setPresenting(false)}
                />
              ) : null}
              <PaneHosts
                hosts={hosts}
                panes={view.mounted}
                render={renderPane}
              />
              <div
                className="visually-hidden layout-announcer"
                role="status"
                aria-live="polite"
              >
                {state.announcement}
              </div>
            </ViewerProvider>
          </TreeControlContext.Provider>
        </MainContentContext.Provider>
      </LayoutContext.Provider>
    </OpenModelsContext.Provider>
  );
}
