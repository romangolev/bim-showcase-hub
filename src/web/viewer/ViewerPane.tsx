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
import { formatCount } from '../extensions/modelSummary.js';
import { registerViewerTools } from '../extensions/viewerTools.js';
import { useTheme } from '../theme/ThemeContext.js';
import { createViewerAdapter } from './createViewerAdapter.js';
import type { ViewerAdapter, ViewerAdapterFactory } from './ViewerAdapter.js';
import { ViewerContext } from './ViewerContext.js';
import './viewer.css';

export interface ViewerPaneProps {
  urn: string;
  onReady?: (adapter: ViewerAdapter) => void;
  factory?: ViewerAdapterFactory;
  tools?: boolean;
  children?: ReactNode;
}

type PaneState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string };

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
  children,
}: ViewerPaneProps) {
  const outer = useContext(ViewerContext);
  const publish = outer?.setAdapter;
  const hostRef = useRef<HTMLDivElement>(null);
  const adapterRef = useRef<ViewerAdapter | null>(null);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const [exportStatus, setExportStatus] = useState<ExportStatus | null>(null);
  const onReadyRef = useRef(onReady);
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
    const grid = host.closest('.model-page') ?? host.parentElement;
    grid?.addEventListener('transitionend', schedule);
    window.addEventListener('resize', schedule);
    return () => {
      if (pending) cancelAnimationFrame(frame);
      clearTimeout(settle);
      observer?.disconnect();
      grid?.removeEventListener('transitionend', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);

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
          });
        }
        await instance.load(urn);
        if (cancelled) return;
        adapterRef.current = instance;
        instance.resize();
        setAdapter(instance);
        publish?.(instance);
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
      publish?.(null);
    };
  }, [urn, factory, tools, publish, attempt, handleExportStatus]);

  const value = useMemo(
    () => ({ adapter, setAdapter: publish ?? (() => {}) }),
    [adapter, publish],
  );

  return (
    <ViewerContext.Provider value={value}>
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
    </ViewerContext.Provider>
  );
}
