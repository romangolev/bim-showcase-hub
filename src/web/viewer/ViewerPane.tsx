import {
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { registerPaintBrushes } from '../extensions/paintBrushes.js';
import { createViewerAdapter } from './createViewerAdapter.js';
import type { ViewerAdapter, ViewerAdapterFactory } from './ViewerAdapter.js';
import { ViewerContext } from './ViewerContext.js';
import './viewer.css';

export interface ViewerPaneProps {
  urn: string;
  onReady?: (adapter: ViewerAdapter) => void;
  factory?: ViewerAdapterFactory;
  paintBrushes?: boolean;
  children?: ReactNode;
}

type PaneState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string };

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : 'The model could not be loaded';
}

export function ViewerPane({
  urn,
  onReady,
  factory = createViewerAdapter,
  paintBrushes = true,
  children,
}: ViewerPaneProps) {
  const outer = useContext(ViewerContext);
  const publish = outer?.setAdapter;
  const hostRef = useRef<HTMLDivElement>(null);
  const onReadyRef = useRef(onReady);
  const [adapter, setAdapter] = useState<ViewerAdapter | null>(null);
  const [state, setState] = useState<PaneState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

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
        if (cancelled) {
          instance.destroy();
          return;
        }
        if (paintBrushes) disposeExtensions = registerPaintBrushes(instance);
        await instance.load(urn);
        if (cancelled) return;
        setAdapter(instance);
        publish?.(instance);
        setState({ status: 'ready' });
        onReadyRef.current?.(instance);
      } catch (err) {
        if (!cancelled) setState({ status: 'error', message: messageOf(err) });
      }
    })();

    return () => {
      cancelled = true;
      disposeExtensions?.();
      created?.destroy();
      setAdapter(null);
      publish?.(null);
    };
  }, [urn, factory, paintBrushes, publish, attempt]);

  const value = useMemo(
    () => ({ adapter, setAdapter: publish ?? (() => {}) }),
    [adapter, publish],
  );

  return (
    <ViewerContext.Provider value={value}>
      <div className="bsh-viewer-pane" data-state={state.status}>
        <div ref={hostRef} className="bsh-viewer-surface" />
        {state.status === 'loading' && (
          <div className="bsh-viewer-overlay" role="status">
            Loading model
          </div>
        )}
        {state.status === 'error' && (
          <div
            className="bsh-viewer-overlay bsh-viewer-overlay--error"
            role="alert"
          >
            <span>{state.message}</span>
            <button type="button" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </button>
          </div>
        )}
        {children}
      </div>
    </ViewerContext.Provider>
  );
}
