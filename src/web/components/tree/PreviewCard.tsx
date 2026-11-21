import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { TreeNode } from '../../../shared/types.js';
import { thumbnailPath } from '../../api/client.js';
import { useOutsidePointer } from '../usePopover.js';
import { versionParts } from './TreeRowView.js';
import { formatSize } from './treeView.js';
import { VIEW_STATE_COPY, viewStateOf } from './viewStateCopy.js';

export interface PreviewCardProps {
  node: TreeNode;
  anchor: DOMRect;
  showImage: boolean;
  onClose: () => void;
}

const GAP = 4;

function metaParts(node: TreeNode): string[] {
  const parts = node.kind === 'version' ? versionParts(node.name) : null;
  const date = parts?.date ?? node.modifiedAt?.slice(0, 10);
  const author = parts?.author ?? node.modifiedBy;
  const size = node.size === undefined ? undefined : formatSize(node.size);
  return [date, author, size].filter((entry): entry is string =>
    Boolean(entry),
  );
}

export function PreviewCard({
  node,
  anchor,
  showImage,
  onClose,
}: PreviewCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const parts = node.kind === 'version' ? versionParts(node.name) : null;
  const urn = node.tipUrn ?? node.urn;
  const state = viewStateOf(node);
  const meta = metaParts(node);

  useLayoutEffect(() => {
    const box = cardRef.current;
    if (!box) return;
    const width = box.offsetWidth;
    const height = box.offsetHeight;
    const left = Math.max(
      GAP,
      Math.min(anchor.right - width, window.innerWidth - width - GAP),
    );
    const below = anchor.bottom + GAP;
    const top =
      below + height > window.innerHeight
        ? Math.max(GAP, anchor.top - height - GAP)
        : below;
    setPosition({ top, left });
  }, [anchor]);

  useOutsidePointer(true, [cardRef], onClose);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      ref={cardRef}
      className="tree-preview"
      role="dialog"
      aria-label={`Preview of ${node.name}`}
      style={
        position
          ? { top: position.top, left: position.left }
          : { top: 0, left: 0, visibility: 'hidden' }
      }
    >
      {showImage ? (
        urn && !failed ? (
          <img
            className="tree-preview__image"
            src={thumbnailPath(urn, 200)}
            alt={`Thumbnail of ${node.name}`}
            loading="lazy"
            onError={() => setFailed(true)}
          />
        ) : (
          <span className="tree-preview__image tree-preview__image--empty">
            No thumbnail
          </span>
        )
      ) : null}
      <div className="tree-preview__body">
        <span className="tree-preview__title">{parts?.label ?? node.name}</span>
        {node.kind !== 'version' && node.versionNumber !== undefined ? (
          <span className="tree-preview__version">v{node.versionNumber}</span>
        ) : null}
        {node.latest ? (
          <span
            className="tree-row__latest"
            role="note"
            aria-label="Latest version"
          >
            Latest
          </span>
        ) : null}
        {meta.length > 0 ? (
          <span className="tree-preview__meta">{meta.join(' · ')}</span>
        ) : null}
        {node.kind === 'version' ? (
          <span className="tree-preview__state" data-state={state}>
            {VIEW_STATE_COPY[state].label}
          </span>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
