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
import {
  claimRegion,
  detectRegion,
  regionConflictMessage,
  type ViewerRegion,
} from './region.js';
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
  children?: ReactNode;
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
  if (status.phase === 'done')
    return `Exported ${formatCount(status.rowCount)} rows`;
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
  children,
}: ViewerPaneProps) {
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
    let pending = false;
    let frame = 0;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(settle);
      settle = setTimeout(() => adapterRef.current?.resize(), SETTLE_MS);
      if (pending) return;
      pending = true;
      frame = requestAnimationFrame(() => {
        pending = false;
        adapterRef.current?.resize();
      });
    };
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(schedule);
    observer?.observe(host);
    window.addEventListener('resize', schedule);
    return () => {
      if (pending) cancelAnimationFrame(frame);
      clearTimeout(settle);
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
    if (!claimRegion(region)) {
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
        await instance.load(urn);
        if (cancelled) return;
        adapterRef.current = instance;
        instance.resize();
        setAdapter(instance);
        publish?.(urn, instance);
        setState({ status: 'ready' });
        onReadyRef.current?.(instance);
      } catch (err) {
        if (!cancelled) setState({ status: 'error', message: detailOf(err) });
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
              data-variant={exportStatus.phase === 'error' ? 'error' : 'ok'}
              title={describeStatus(exportStatus)}
            >
              <span className="badge__dot" aria-hidden="true" />
              <span className="bsh-viewer-badge__text">
                {badgeText(exportStatus)}
              </span>
            </span>
          ) : null}
        </div>
        {children}
      </div>
    </ModelViewerContext.Provider>
  );
}
