import {
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StateBlock } from '../components/StateBlock.js';
import { registerPaintBrushes } from '../extensions/paintBrushes.js';
import { useTheme } from '../theme/ThemeContext.js';
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

const LOAD_ERROR_COPY =
  'The model could not be loaded. It may still be processing, or you may not have access to it.';

function detailOf(err: unknown): string {
  return err instanceof Error ? err.message : '';
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
  const { theme } = useTheme();
  const themeRef = useRef(theme);
  const instanceRef = useRef<ViewerAdapter | null>(null);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

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
        if (paintBrushes) disposeExtensions = registerPaintBrushes(instance);
        await instance.load(urn);
        if (cancelled) return;
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
      disposeExtensions?.();
      created?.destroy();
      if (instanceRef.current === created) instanceRef.current = null;
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
        {children}
      </div>
    </ViewerContext.Provider>
  );
}
