import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  useRef,
} from 'react';
import { useModelContext } from '../api/useModelContext.js';
import { DocumentTree } from './tree/DocumentTree.js';
import {
  TREE_WIDTH_MAX,
  TREE_WIDTH_MIN,
  useTreeWidth,
} from './useTreeWidth.js';

export interface TreePanelProps {
  open: boolean;
  onNavigate?: () => void;
}

export function TreePanel({ open, onNavigate }: TreePanelProps) {
  const navigate = useNavigate();
  const { urn } = useParams({ strict: false }) as { urn?: string };
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const { trail } = useModelContext(urn, search);
  const { width, preview, commit } = useTreeWidth();
  const panelRef = useRef<HTMLElement>(null);
  const dragging = useRef(false);

  const widthAt = (clientX: number) =>
    clientX - (panelRef.current?.getBoundingClientRect().left ?? 0);

  const onPointerDown = (event: PointerEvent<HTMLHRElement>) => {
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const onPointerMove = (event: PointerEvent<HTMLHRElement>) => {
    if (dragging.current) {
      preview(widthAt(event.clientX));
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLHRElement>) => {
    if (!dragging.current) {
      return;
    }
    dragging.current = false;
    commit(widthAt(event.clientX));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLHRElement>) => {
    const step = event.shiftKey ? 48 : 16;
    const next: Record<string, number> = {
      ArrowLeft: width - step,
      ArrowRight: width + step,
      Home: TREE_WIDTH_MIN,
      End: TREE_WIDTH_MAX,
    };
    const value = next[event.key];
    if (value !== undefined) {
      event.preventDefault();
      commit(value);
    }
  };

  return (
    <aside
      ref={panelRef}
      id="document-panel"
      className="tree-panel"
      aria-label="Documents"
      data-open={open}
      hidden={!open}
      style={{ '--tree-width': `${width}px` } as CSSProperties}
    >
      <div className="tree-panel__head">
        <h2 className="tree-panel__title">Documents</h2>
      </div>
      <DocumentTree
        selectedUrn={urn}
        revealTrail={trail}
        onOpenModel={(next, context) => {
          void navigate({
            to: '/model/$urn',
            params: { urn: next },
            search: context,
          });
          onNavigate?.();
        }}
      />
      <hr
        aria-orientation="vertical"
        aria-label="Resize document panel"
        aria-controls="document-panel"
        aria-valuemin={TREE_WIDTH_MIN}
        aria-valuemax={TREE_WIDTH_MAX}
        aria-valuenow={width}
        tabIndex={0}
        className="tree-panel__resizer"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      />
    </aside>
  );
}
