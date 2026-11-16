import type { HTMLAttributes, Ref } from 'react';
import type { TreeNodeKind } from '../../../shared/types.js';
import { Icon, type IconName } from '../icons.js';

export const ROW_HEIGHT = 30;
const INDENT = 16;

const KIND_ICON: Record<TreeNodeKind, IconName> = {
  hub: 'hub',
  project: 'project',
  folder: 'folder',
  item: 'item',
  version: 'version',
};

export interface TreeRowViewProps {
  level: number;
  kind: TreeNodeKind;
  name: string;
  expandable?: boolean;
  expanded?: boolean;
  selected?: boolean;
  focused?: boolean;
  viewable?: boolean;
  busy?: boolean;
  caption?: string;
  rowProps?: HTMLAttributes<HTMLDivElement> & { ref?: Ref<HTMLDivElement> };
}

export function TreeRowView({
  level,
  kind,
  name,
  expandable = false,
  expanded = false,
  selected = false,
  focused = false,
  viewable = false,
  busy = false,
  caption,
  rowProps,
}: TreeRowViewProps) {
  const isVersion = kind === 'version';
  const disabled = isVersion && !viewable;
  const icon: IconName = disabled ? 'ban' : KIND_ICON[kind];
  return (
    <div
      {...rowProps}
      className="tree-row"
      data-kind={kind}
      data-selected={selected}
      data-focused={focused}
      data-disabled={disabled}
      data-viewable={isVersion && viewable}
      style={{
        ...rowProps?.style,
        height: ROW_HEIGHT,
        paddingInlineStart: `calc(var(--space-2) + ${level * INDENT}px)`,
      }}
    >
      <span
        className="tree-row__twisty"
        data-expanded={expanded}
        data-visible={expandable}
      >
        {busy ? (
          <Icon name="spinner" size={12} className="spin" />
        ) : (
          <Icon name="chevron" size={12} />
        )}
      </span>
      <span className="tree-row__icon">
        <Icon name={icon} size={15} />
      </span>
      <span className="tree-row__label">{name}</span>
      {isVersion && viewable ? (
        <span className="tree-row__badge">3D</span>
      ) : null}
      {disabled ? (
        <span className="tree-row__caption">Not viewable</span>
      ) : null}
      {caption ? <span className="tree-row__caption">{caption}</span> : null}
    </div>
  );
}
