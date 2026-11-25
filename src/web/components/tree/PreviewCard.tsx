import { useEffect, useMemo, useState } from 'react';
import type { TreeNode } from '../../../shared/types.js';
import { thumbnailPath } from '../../api/client.js';
import { Popover, PopoverPopup } from '../../ui/Popover.js';
import { versionParts } from './TreeRowView.js';
import { formatSize } from './treeView.js';
import { VIEW_STATE_COPY, viewStateOf } from './viewStateCopy.js';

export interface PreviewCardProps {
  node: TreeNode;
  anchor: DOMRect;
  showImage: boolean;
  onClose: (restoreFocus: boolean) => void;
}

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
  const [failed, setFailed] = useState(false);
  const parts = node.kind === 'version' ? versionParts(node.name) : null;
  const urn = node.tipUrn ?? node.urn;
  const state = viewStateOf(node);
  const meta = metaParts(node);
  const point = useMemo(
    () => ({ getBoundingClientRect: () => anchor }),
    [anchor],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose(true);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <Popover
      open
      onOpenChange={(next) => {
        if (!next) onClose(false);
      }}
    >
      <PopoverPopup
        className="tree-preview"
        aria-label={`Preview of ${node.name}`}
        anchor={point}
        initialFocus={false}
        finalFocus={false}
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
          <span className="tree-preview__title">
            {parts?.label ?? node.name}
          </span>
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
      </PopoverPopup>
    </Popover>
  );
}
