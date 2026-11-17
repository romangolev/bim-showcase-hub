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
import {
  describeStatus,
  type ExportStatus,
} from '../extensions/excelExport.js';
import {
  describeGlbStatus,
  type GlbExportStatus,
  glbHasWarning,
} from '../extensions/glbExport.js';
import {
  describeIfcStatus,
  type IfcExportStatus,
  ifcHasWarning,
} from '../extensions/ifcExport.js';
import { formatCount } from '../extensions/modelSummary.js';
import { resetPaint } from '../extensions/paintBrushes.js';
import { modelKey, registerViewerTools } from '../extensions/viewerTools.js';
import { useSettings } from '../settings/SettingsContext.js';
import { readIfcSettings } from '../settings/settings.js';
import { useTheme } from '../theme/ThemeContext.js';
import { createViewerAdapter } from './createViewerAdapter.js';
import { ModelsMenu } from './ModelsMenu.js';
import {
  ModelSetError,
  type ModelSource,
  type ModelSpread,
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
import { useModels } from './useModels.js';
import type { ViewerAdapter, ViewerAdapterFactory } from './ViewerAdapter.js';
import { ActiveViewerContext, ModelViewerContext } from './ViewerContext.js';
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
  members?: readonly ModelSource[];
  onRemoveModel?: (urn: string) => void;
  onAddModel?: () => void;
  offsets?: Readonly<Record<string, Vec3>> | null;
  onOffsetsChange?: (offsets: Record<string, Vec3> | null) => void;
  onSpreadChange?: (distanceMeters: number | null) => void;
  children?: ReactNode;
}

const NO_MEMBERS: readonly ModelSource[] = [];

export function membersKey(members: readonly ModelSource[]): string {
  return members.map((member) => member.urn).join(',');
}

type PaneState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string }
  | { status: 'region'; region: ViewerRegion };

export const STATUS_DISMISS_MS = 4000;
export const NOTICE_DISMISS_MS = 8000;
export const ADD_FAILED_MESSAGE = 'Could not add the model';
export const SETTLE_MS = 250;

function isBusy(status: { phase: string }): boolean {
  return status.phase === 'reading' || status.phase === 'building';
}

function badgeText(status: ExportStatus): string {
  if (status.phase === 'error') return 'Export failed';
  if (status.phase === 'done') {
    const rows = `Exported ${formatCount(status.rowCount)} rows`;
    return status.missing?.length
      ? `${rows}, missing ${status.missing.join(', ')}`
      : rows;
  }
  return describeStatus(status);
}

function glbBadgeText(status: GlbExportStatus): string {
  return status.phase === 'error'
    ? 'GLB export failed'
    : describeGlbStatus(status);
}

interface StatusBadge {
  text: string;
  detail: string;
  error: boolean;
}

function excelBadge(status: ExportStatus): StatusBadge {
  return {
    text: badgeText(status),
    detail: describeStatus(status),
    error:
      status.phase === 'error' ||
      (status.phase === 'done' && Boolean(status.missing?.length)),
  };
}

function glbBadge(status: GlbExportStatus): StatusBadge {
  return {
    text: glbBadgeText(status),
    detail: describeGlbStatus(status),
    error: glbHasWarning(status),
  };
}

function ifcBadge(status: IfcExportStatus): StatusBadge {
  return {
    text:
      status.phase === 'error'
        ? 'IFC export failed'
        : describeIfcStatus(status),
    detail: describeIfcStatus(status),
    error: ifcHasWarning(status),
  };
}

const LOAD_ERROR_COPY =
  'The model could not be loaded. It may still be processing, or you may not have access to it.';

function detailOf(err: unknown): string {
  return err instanceof Error ? err.message : '';
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
  members = NO_MEMBERS,
  onRemoveModel,
  onAddModel,
  offsets = null,
  onOffsetsChange,
  onSpreadChange,
  children,
}: ViewerPaneProps) {
  const membersRef = useRef(members);
  membersRef.current = members;
  const nameRef = useRef(name);
  nameRef.current = name;
  const [setNotice, setSetNotice] = useState<string | null>(null);
  const registry = useContext(ActiveViewerContext);
  const publish = registry?.publish;
  const withdraw = registry?.withdraw;
  const hostRef = useRef<HTMLDivElement>(null);
  const adapterRef = useRef<ViewerAdapter | null>(null);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const [statusBadge, setStatusBadge] = useState<StatusBadge | null>(null);
  const onReadyRef = useRef(onReady);
  const exportNameRef = useRef(exportName);
  exportNameRef.current = exportName;
  const [adapter, setAdapter] = useState<ViewerAdapter | null>(null);
  const [state, setState] = useState<PaneState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const { theme } = useTheme();
  const { settings } = useSettings();
  const ifcSettingsRef = useRef(settings.ifc);
  ifcSettingsRef.current = settings.ifc;
  const themeRef = useRef(theme);
  const instanceRef = useRef<ViewerAdapter | null>(null);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  const showBadge = useCallback((badge: StatusBadge, busy: boolean) => {
    clearTimeout(statusTimer.current);
    setStatusBadge(badge);
    if (!busy) {
      statusTimer.current = setTimeout(
        () => setStatusBadge(null),
        STATUS_DISMISS_MS,
      );
    }
  }, []);

  const handleExportStatus = useCallback(
    (next: ExportStatus) => showBadge(excelBadge(next), isBusy(next)),
    [showBadge],
  );

  const handleGeometryStatus = useCallback(
    (next: GlbExportStatus) => showBadge(glbBadge(next), isBusy(next)),
    [showBadge],
  );

  const handleIfcStatus = useCallback(
    (next: IfcExportStatus) => showBadge(ifcBadge(next), isBusy(next)),
    [showBadge],
  );

  useEffect(() => () => clearTimeout(statusTimer.current), []);

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

    (async () => {
      try {
        const instance = await factory(host);
        created = instance;
        instanceRef.current = instance;
        instance.setTheme(themeRef.current);
        if (cancelled) {
          instance.destroy();
          return;
        }
        const extra = membersRef.current;
        const primaryName = nameRef.current;
        if (extra.length > 0) {
          await instance.loadModels([
            primaryName ? { urn, name: primaryName } : { urn },
            ...extra,
          ]);
        } else if (primaryName) {
          await instance.load(urn, primaryName);
        } else {
          await instance.load(urn);
        }
        if (cancelled) return;
        adapterRef.current = instance;
        instance.resize();
        setAdapter(instance);
        publish?.(urn, instance);
        setState({ status: 'ready' });
        onReadyRef.current?.(instance);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof RegionConflictError) {
          setState({ status: 'region', region: err.region });
          return;
        }
        setState({ status: 'error', message: detailOf(err) });
      }
    })();

    return () => {
      cancelled = true;
      adapterRef.current = null;
      created?.destroy();
      if (instanceRef.current === created) instanceRef.current = null;
      setAdapter(null);
      if (created) withdraw?.(urn, created);
    };
  }, [urn, factory, publish, withdraw, attempt]);

  useEffect(() => {
    if (!adapter || !tools) return;
    return registerViewerTools(adapter, {
      onStatus: handleExportStatus,
      onGeometryStatus: handleGeometryStatus,
      onIfcStatus: handleIfcStatus,
      ifcSettings: () => readIfcSettings(ifcSettingsRef.current),
      key: modelKey(urn),
      fileName: () => exportNameRef.current ?? '',
      features: {
        paint: settings.paintBrushes,
        export: settings.excelExport,
        geometry: settings.glbExport,
        ifc: settings.ifcExport,
      },
    });
  }, [
    adapter,
    tools,
    urn,
    settings.paintBrushes,
    settings.excelExport,
    settings.glbExport,
    settings.ifcExport,
    handleExportStatus,
    handleGeometryStatus,
    handleIfcStatus,
  ]);

  const paintWasOn = useRef(settings.paintBrushes);
  useEffect(() => {
    const wasOn = paintWasOn.current;
    paintWasOn.current = settings.paintBrushes;
    if (wasOn && !settings.paintBrushes && adapter && tools) {
      resetPaint(adapter);
    }
  }, [adapter, tools, settings.paintBrushes]);

  const sourceFor = useCallback(
    (id: string): ModelSource => {
      if (id === urn) {
        return nameRef.current ? { urn, name: nameRef.current } : { urn };
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
              title="Model unavailable"
              message={LOAD_ERROR_COPY}
              detail={state.message || undefined}
              action={{
                label: 'Try again',
                onClick: () => setAttempt((n) => n + 1),
              }}
              className="bsh-viewer-error"
            />
          </div>
        )}
        <div className="bsh-viewer-status" role="status" aria-live="polite">
          {statusBadge ? (
            <span
              className="badge bsh-viewer-badge"
              data-variant={statusBadge.error ? 'error' : 'ok'}
              title={statusBadge.detail}
            >
              <span className="badge__dot" aria-hidden="true" />
              <span className="bsh-viewer-badge__text">{statusBadge.text}</span>
            </span>
          ) : null}
        </div>
        {adapter && combined ? (
          <ModelsMenu
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
