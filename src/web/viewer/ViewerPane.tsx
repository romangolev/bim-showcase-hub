import {
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { StateBlock } from '../components/StateBlock.js';
import {
  describeStatus,
  type ExportStatus,
} from '../extensions/excelExport.js';
import { formatCount } from '../extensions/modelSummary.js';
import { modelKey, registerViewerTools } from '../extensions/viewerTools.js';
import { useTheme } from '../theme/ThemeContext.js';
import { createViewerAdapter } from './createViewerAdapter.js';
import { ModelsMenu } from './ModelsMenu.js';
import { ModelSetError, type ModelSource } from './modelSet.js';
import {
  detectRegion,
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
export const SETTLE_MS = 250;

function isBusy(status: ExportStatus): boolean {
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
  const [exportStatus, setExportStatus] = useState<ExportStatus | null>(null);
  const onReadyRef = useRef(onReady);
  const exportNameRef = useRef(exportName);
  exportNameRef.current = exportName;
  const [adapter, setAdapter] = useState<ViewerAdapter | null>(null);
  const [state, setState] = useState<PaneState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const { theme } = useTheme();
  const themeRef = useRef(theme);
  const instanceRef = useRef<ViewerAdapter | null>(null);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  const handleExportStatus = useCallback((next: ExportStatus) => {
    clearTimeout(statusTimer.current);
    setExportStatus(next);
    if (!isBusy(next)) {
      statusTimer.current = setTimeout(
        () => setExportStatus(null),
        STATUS_DISMISS_MS,
      );
    }
  }, []);

  useEffect(() => () => clearTimeout(statusTimer.current), []);

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
    let disposeExtensions: (() => void) | null = null;
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
        if (tools) {
          disposeExtensions = registerViewerTools(instance, {
            onStatus: handleExportStatus,
            key: modelKey(urn),
            fileName: () => exportNameRef.current ?? '',
          });
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
      disposeExtensions?.();
      created?.destroy();
      if (instanceRef.current === created) instanceRef.current = null;
      setAdapter(null);
      if (created) withdraw?.(urn, created);
    };
  }, [urn, factory, tools, publish, withdraw, attempt, handleExportStatus]);

  const memberKey = membersKey(members);
  useEffect(() => {
    if (!adapter) return;
    const wanted = (memberKey ? memberKey.split(',') : []).map(
      (member) =>
        membersRef.current.find((source) => source.urn === member) ?? {
          urn: member,
        },
    );
    const current = adapter.getModels().filter((model) => model.id !== urn);
    for (const model of current) {
      if (!wanted.some((member) => member.urn === model.urn)) {
        adapter.removeModel(model.id);
      }
    }
    for (const member of wanted) {
      if (current.some((model) => model.urn === member.urn)) continue;
      adapter.addModel(member).then(
        () => setSetNotice(null),
        (err: unknown) => {
          if (
            err instanceof ModelSetError &&
            err.code !== 'closed' &&
            err.code !== 'cancelled'
          ) {
            setSetNotice(err.message);
          }
        },
      );
    }
  }, [adapter, urn, memberKey]);

  const models = useModels(adapter);
  const combined = members.length > 0 || models.length > 1;

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
          {exportStatus ? (
            <span
              className="badge bsh-viewer-badge"
              data-variant={
                exportStatus.phase === 'error' ||
                (exportStatus.phase === 'done' && exportStatus.missing?.length)
                  ? 'error'
                  : 'ok'
              }
              title={describeStatus(exportStatus)}
            >
              <span className="badge__dot" aria-hidden="true" />
              <span className="bsh-viewer-badge__text">
                {badgeText(exportStatus)}
              </span>
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
            onAdd={onAddModel}
          />
        ) : null}
        {setNotice ? (
          <p className="bsh-viewer-models__notice" role="alert">
            {setNotice}
          </p>
        ) : null}
        {children}
      </div>
    </ModelViewerContext.Provider>
  );
}
