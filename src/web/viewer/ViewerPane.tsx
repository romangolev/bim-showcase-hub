import {
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StateBlock } from '../components/StateBlock.js';
import { LayoutContext } from '../layout/layoutContext.js';
import { notify } from '../tasks/notifications.js';
import { startTask } from '../tasks/taskStore.js';
import { useTheme } from '../theme/ThemeContext.js';
import { TOOLS, useViewerTools } from '../tools/index.js';
import { modelKey } from '../tools/kernel/modelKey.js';
import { createViewerAdapter } from './createViewerAdapter.js';
import { explainFailure } from './failureExplainer.js';
import { useIncomingLink } from './incomingLink.js';
import { ModelsMenu } from './ModelsMenu.js';
import {
  type FailureReason,
  type ModelMeta,
  ModelSetError,
  type ModelSource,
  type ModelSpread,
  reasonOf,
  type Vec3,
} from './modelSet.js';
import {
  detectRegion,
  onRegionChange,
  RegionConflictError,
  regionAvailable,
  regionConflictMessage,
  type ViewerRegion,
} from './region.js';
import { ShareMenu } from './ShareMenu.js';
import { shouldRestore } from './tabState.js';
import { useModels } from './useModels.js';
import { useModelVisibilityMemory } from './useModelVisibilityMemory.js';
import type {
  LoadStage,
  ViewerAdapter,
  ViewerAdapterFactory,
  ViewerState,
} from './ViewerAdapter.js';
import { ActiveViewerContext, ModelViewerContext } from './ViewerContext.js';
import { viewPrefsFor } from './views.js';
import './viewer.css';
import './viewerChrome.css';

export interface ViewerPaneProps {
  urn: string;
  onReady?: (adapter: ViewerAdapter) => void;
  factory?: ViewerAdapterFactory;
  tools?: boolean;
  resizeSignal?: number;
  exportName?: string;
  onKeepOnly?: () => void;
  name?: string;
  meta?: ModelMeta;
  members?: readonly ModelSource[];
  onRemoveModel?: (urn: string) => void;
  onAddModel?: () => void;
  offsets?: Readonly<Record<string, Vec3>> | null;
  onOffsetsChange?: (offsets: Record<string, Vec3> | null) => void;
  onSpreadChange?: (distanceMeters: number | null) => void;
  initialView?: string | null;
  onViewConsumed?: () => void;
  savedState?: ViewerState | null;
  onSaveState?: (state: ViewerState) => void;
  shareHref?: string;
  onManageViewpoints?: () => void;
  onPresent?: () => void;
  children?: ReactNode;
}

const NO_MEMBERS: readonly ModelSource[] = [];

export function membersKey(members: readonly ModelSource[]): string {
  return members.map((member) => member.urn).join(',');
}

type PaneState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string; reason: FailureReason }
  | { status: 'region'; region: ViewerRegion };

export const NOTICE_DISMISS_MS = 8000;
export const ADD_FAILED_MESSAGE = 'Could not add the model';
export const SETTLE_MS = 250;

export const STAGE_TEXT: Record<LoadStage, string> = {
  starting: 'Starting the viewer',
  manifest: 'Reading the model manifest',
  geometry: 'Loading geometry',
};

function detailOf(err: unknown): string {
  return err instanceof Error ? err.message : '';
}

function saveTabState(
  adapter: ViewerAdapter,
  save: ((state: ViewerState) => void) | undefined,
): void {
  if (!save) return;
  try {
    save(adapter.getState());
  } catch {
    return;
  }
}

function startViewOf(urn: string): ModelMeta {
  const start = viewPrefsFor(urn).start;
  return start ? { view: start } : {};
}

export function ViewerPane({
  urn,
  onReady,
  factory = createViewerAdapter,
  tools = true,
  resizeSignal,
  exportName,
  onKeepOnly,
  name,
  meta,
  members = NO_MEMBERS,
  onRemoveModel,
  onAddModel,
  offsets = null,
  onOffsetsChange,
  onSpreadChange,
  initialView = null,
  onViewConsumed,
  savedState = null,
  onSaveState,
  shareHref,
  onManageViewpoints,
  onPresent,
  children,
}: ViewerPaneProps) {
  const membersRef = useRef(members);
  membersRef.current = members;
  const nameRef = useRef(name);
  nameRef.current = name;
  const metaRef = useRef(meta);
  metaRef.current = meta;
  const savedStateRef = useRef(savedState);
  savedStateRef.current = savedState;
  const onSaveStateRef = useRef(onSaveState);
  onSaveStateRef.current = onSaveState;
  const [setNotice, setSetNotice] = useState<string | null>(null);
  const registry = useContext(ActiveViewerContext);
  const publish = registry?.publish;
  const withdraw = registry?.withdraw;
  const hostRef = useRef<HTMLDivElement>(null);
  const adapterRef = useRef<ViewerAdapter | null>(null);
  const onReadyRef = useRef(onReady);
  const exportNameRef = useRef(exportName);
  exportNameRef.current = exportName;
  const [adapter, setAdapter] = useState<ViewerAdapter | null>(null);
  const [state, setState] = useState<PaneState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [stage, setStage] = useState<LoadStage>('starting');
  const { scheme: theme } = useTheme();
  const themeRef = useRef(theme);
  const instanceRef = useRef<ViewerAdapter | null>(null);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    if (!setNotice) return;
    const timer = setTimeout(() => setSetNotice(null), NOTICE_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [setNotice]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const schedule = () => adapterRef.current?.scheduleResize(SETTLE_MS);
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(schedule);
    observer?.observe(host);
    window.addEventListener('resize', schedule);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, []);

  const seenSignal = useRef(resizeSignal);
  useEffect(() => {
    if (seenSignal.current === resizeSignal) return;
    seenSignal.current = resizeSignal;
    adapterRef.current?.resize();
  }, [resizeSignal]);

  useEffect(() => {
    themeRef.current = theme;
    instanceRef.current?.setTheme(theme);
  }, [theme]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.dataset.attempt = String(attempt);
    let cancelled = false;
    let created: ViewerAdapter | null = null;
    const region = detectRegion(urn);
    if (!regionAvailable(region)) {
      setState({ status: 'region', region });
      return;
    }
    setState({ status: 'loading' });
    setStage('starting');
    let stopStage: (() => void) | undefined;
    const task = startTask({
      label: `Loading ${nameRef.current ?? 'model'}`,
      retry: () => setAttempt((n) => n + 1),
    });

    (async () => {
      try {
        const instance = await factory(host);
        created = instance;
        instanceRef.current = instance;
        instance.setTheme(themeRef.current);
        stopStage = instance.onLoadStage((next) => {
          setStage(next);
          task.progress(null, STAGE_TEXT[next]);
        });
        if (cancelled) {
          instance.destroy();
          return;
        }
        const extra = membersRef.current;
        const primaryName = nameRef.current;
        const primaryMeta = metaRef.current;
        if (extra.length > 0) {
          await instance.loadModels([
            {
              urn,
              ...(primaryName ? { name: primaryName } : {}),
              ...primaryMeta,
              ...startViewOf(urn),
            },
            ...extra.map((member) => ({
              ...startViewOf(member.urn),
              ...member,
            })),
          ]);
        } else if (primaryMeta) {
          await instance.load(urn, primaryName, {
            ...primaryMeta,
            ...startViewOf(urn),
          });
        } else if (primaryName) {
          await instance.load(urn, primaryName, startViewOf(urn));
        } else {
          await instance.load(urn, undefined, startViewOf(urn));
        }
        if (cancelled) return;
        adapterRef.current = instance;
        instance.resize();
        setAdapter(instance);
        publish?.(urn, instance);
        setState({ status: 'ready' });
        task.finish();
        onReadyRef.current?.(instance);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof RegionConflictError) {
          task.cancel();
          setState({ status: 'region', region: err.region });
          return;
        }
        task.fail(err);
        setState({
          status: 'error',
          message: detailOf(err),
          reason: reasonOf(err),
        });
      }
    })();

    return () => {
      cancelled = true;
      task.discard();
      stopStage?.();
      if (created && adapterRef.current === created) {
        saveTabState(created, onSaveStateRef.current);
      }
      adapterRef.current = null;
      created?.destroy();
      if (instanceRef.current === created) instanceRef.current = null;
      setAdapter(null);
      if (created) withdraw?.(urn, created);
    };
  }, [urn, factory, publish, withdraw, attempt]);

  useEffect(() => {
    if (!adapter) return;
    const save = () => saveTabState(adapter, onSaveStateRef.current);
    window.addEventListener('pagehide', save);
    return () => window.removeEventListener('pagehide', save);
  }, [adapter]);

  useViewerTools(TOOLS, {
    adapter,
    active: tools,
    suffix: modelKey(urn),
    fileName: () => exportNameRef.current ?? '',
  });

  const sourceFor = useCallback(
    (id: string): ModelSource => {
      if (id === urn) {
        return {
          urn,
          ...(nameRef.current ? { name: nameRef.current } : {}),
          ...metaRef.current,
        };
      }
      return (
        membersRef.current.find((source) => source.urn === id) ?? { urn: id }
      );
    },
    [urn],
  );

  const addMember = useCallback(
    (target: ViewerAdapter, source: ModelSource) => {
      target.addModel(source).then(
        () => setSetNotice(null),
        (err: unknown) => {
          if (!(err instanceof ModelSetError)) {
            setSetNotice(ADD_FAILED_MESSAGE);
          } else if (err.code !== 'closed' && err.code !== 'cancelled') {
            setSetNotice(err.message);
          }
        },
      );
    },
    [],
  );

  const memberKey = membersKey(members);
  useEffect(() => {
    if (!adapter) return;
    const wanted = (memberKey ? memberKey.split(',') : []).map(sourceFor);
    const current = adapter.getModels().filter((model) => model.id !== urn);
    for (const model of current) {
      if (!wanted.some((member) => member.urn === model.urn)) {
        adapter.removeModel(model.id);
      }
    }
    for (const member of wanted) {
      if (current.some((model) => model.urn === member.urn)) continue;
      addMember(adapter, member);
    }
  }, [adapter, urn, memberKey, sourceFor, addMember]);

  const retried = useRef(new Set<string>());
  useEffect(() => {
    if (!adapter) return;
    const seen = retried.current;
    return onRegionChange(() => {
      for (const model of adapter.getModels()) {
        if (model.status !== 'error' || seen.has(model.id)) continue;
        seen.add(model.id);
        addMember(adapter, sourceFor(model.id));
      }
    });
  }, [adapter, sourceFor, addMember]);

  const loaded = useModels(adapter);
  useModelVisibilityMemory(adapter, loaded);
  const restoredFor = useRef<ViewerAdapter | null>(null);
  useEffect(() => {
    if (!adapter || restoredFor.current === adapter) return;
    if (loaded.length === 0) return;
    if (loaded.some((model) => model.status === 'loading')) return;
    restoredFor.current = adapter;
    const saved = savedStateRef.current;
    if (!shouldRestore(saved, initialView)) return;
    void adapter.restoreState(saved);
  }, [adapter, loaded, initialView]);
  const labelKey = JSON.stringify([
    name ? [urn, name] : null,
    ...members.map((member) =>
      member.name ? [member.urn, member.name] : null,
    ),
  ]);
  const models = useMemo(() => {
    const labels = new Map<string, string>();
    for (const entry of JSON.parse(labelKey) as ([string, string] | null)[]) {
      if (entry && !labels.has(entry[0])) labels.set(entry[0], entry[1]);
    }
    return loaded.map((model) => {
      const label = labels.get(model.urn);
      return label && label !== model.name ? { ...model, name: label } : model;
    });
  }, [loaded, labelKey]);
  const combined = members.length > 0 || models.length > 1;
  const orderKey = [urn, ...members.map((member) => member.urn)].join('\n');
  const layout = useContext(LayoutContext);
  useIncomingLink({
    adapter,
    loaded,
    raw: initialView,
    modelIds: orderKey.split('\n'),
    layout: layout ?? null,
    clear: onViewConsumed,
    onResult: (text, error) =>
      notify(text, { tone: error ? 'error' : 'success' }),
  });
  const [spread, setSpread] = useState<ModelSpread | null>(null);
  const onSpreadRef = useRef(onSpreadChange);
  onSpreadRef.current = onSpreadChange;
  useEffect(() => {
    const next = adapter && models.length > 1 ? adapter.getSpread() : null;
    setSpread(next);
    onSpreadRef.current?.(next?.farApart ? next.distanceMeters : null);
  }, [adapter, models]);

  const [localOffsets, setLocalOffsets] = useState<Record<string, Vec3> | null>(
    null,
  );
  const shownOffsets = onOffsetsChange ? offsets : localOffsets;
  const offsetsKey =
    shownOffsets && Object.keys(shownOffsets).length > 0
      ? JSON.stringify(shownOffsets)
      : '';
  const changeOffsets = onOffsetsChange ?? setLocalOffsets;
  const appliedOffsets = useRef('');
  useEffect(() => {
    if (!adapter) {
      appliedOffsets.current = '';
      return;
    }
    if (appliedOffsets.current === offsetsKey) return;
    appliedOffsets.current = offsetsKey;
    adapter.setModelOffsets(
      offsetsKey ? (JSON.parse(offsetsKey) as Record<string, Vec3>) : null,
    );
  }, [adapter, offsetsKey]);
  const together = Boolean(offsetsKey);
  return (
    <ModelViewerContext.Provider value={adapter}>
      <div className="bsh-viewer-pane" data-state={state.status}>
        <div ref={hostRef} className="bsh-viewer-surface" />
        {state.status === 'loading' && (
          <div className="bsh-viewer-overlay">
            <StateBlock
              variant="loading"
              message="Loading model"
              rows={3}
              className="bsh-viewer-skeleton"
            />
            <p className="bsh-viewer-stage" role="status">
              {STAGE_TEXT[stage]}
            </p>
          </div>
        )}
        {state.status === 'region' && (
          <div className="bsh-viewer-overlay">
            <StateBlock
              variant="error"
              title="Model in another region"
              message={regionConflictMessage(state.region)}
              action={
                onKeepOnly
                  ? {
                      label: 'Close other models and reload',
                      onClick: onKeepOnly,
                    }
                  : undefined
              }
              className="bsh-viewer-error"
            />
          </div>
        )}
        {state.status === 'error' && (
          <div className="bsh-viewer-overlay">
            <StateBlock
              variant="error"
              title={explainFailure(state.reason).title}
              message={explainFailure(state.reason).text}
              detail={state.message || undefined}
              action={
                explainFailure(state.reason).retry
                  ? {
                      label: 'Try again',
                      onClick: () => setAttempt((n) => n + 1),
                    }
                  : undefined
              }
              className="bsh-viewer-error"
            />
          </div>
        )}
        {adapter ? (
          <ShareMenu
            adapter={adapter}
            modelIds={orderKey.split('\n')}
            baseHref={shareHref}
            fileName={exportName}
            combined={combined}
            onManageViewpoints={onManageViewpoints}
            onPresent={onPresent}
            frameSize={() => {
              const host = hostRef.current;
              return host
                ? { width: host.clientWidth, height: host.clientHeight }
                : null;
            }}
            caption={{
              name: combined
                ? `${name ?? 'Model'} and ${models.length - 1} more`
                : (name ?? exportName?.replace(/\.xlsx$/, '') ?? 'Model'),
              ...(meta?.version ? { version: meta.version } : {}),
            }}
            onResult={(text, error) =>
              notify(text, { tone: error ? 'error' : 'success' })
            }
          />
        ) : null}
        {adapter && combined ? (
          <ModelsMenu
            adapter={adapter}
            models={models}
            onToggle={(id, visible) => adapter.setModelVisible(id, visible)}
            onRemove={(id) => {
              if (onRemoveModel) onRemoveModel(id);
              else adapter.removeModel(id);
            }}
            onRetry={(id) => addMember(adapter, sourceFor(id))}
            onAdd={onAddModel}
            spread={spread}
            together={together}
            onBringTogether={() => changeOffsets(adapter.getTogetherOffsets())}
            onRestorePositions={() => changeOffsets(null)}
          />
        ) : null}
        {setNotice ? (
          <div className="bsh-viewer-models__notice" role="alert">
            <span>{setNotice}</span>
            <button
              type="button"
              className="bsh-viewer-models__notice-dismiss"
              onClick={() => setSetNotice(null)}
            >
              Dismiss
            </button>
          </div>
        ) : null}
        {children}
      </div>
    </ModelViewerContext.Provider>
  );
}
