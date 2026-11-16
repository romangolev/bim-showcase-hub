import type { HTMLAttributes, ReactNode, Ref } from 'react';
import type { TreeNodeKind } from '../../../shared/types.js';
import { Icon, type IconName } from '../icons.js';

export const ROW_HEIGHT = 30;
export const TWO_LINE_ROW_HEIGHT = 46;
const INDENT = 16;

const KIND_ICON: Record<TreeNodeKind, IconName> = {
  hub: 'hub',
  project: 'project',
  folder: 'folder',
  item: 'item',
  version: 'version',
};

const VERSION_PATTERN = /^(v\S+?):\s*(.*?)\s+by\s+(.+)$/;

export interface VersionParts {
  label: string;
  detail: string;
}

export function versionParts(name: string): VersionParts | null {
  const match = VERSION_PATTERN.exec(name);
  if (!match) {
    return null;
  }
  return {
    label: match[1] ?? '',
    detail: `${(match[2] ?? '').replace(/^(\d{4}-\d{2}-\d{2}) \d{2}:\d{2}$/, '$1')} by ${match[3] ?? ''}`,
  };
}

export function rowHeightFor(
  kind: TreeNodeKind,
  name: string,
  secondary?: string,
): number {
  if (secondary) {
    return TWO_LINE_ROW_HEIGHT;
  }
  return kind === 'version' && versionParts(name)
    ? TWO_LINE_ROW_HEIGHT
    : ROW_HEIGHT;
}

export function highlightMatch(text: string, query?: string): ReactNode {
  const needle = query?.trim().toLowerCase();
  if (!needle) {
    return text;
  }
  const index = text.toLowerCase().indexOf(needle);
  if (index < 0) {
    return text;
  }
  return (
    <>
      {text.slice(0, index)}
      <mark className="tree-row__match">
        {text.slice(index, index + needle.length)}
      </mark>
      {text.slice(index + needle.length)}
    </>
  );
}

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
  secondary?: string;
  highlight?: string;
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
  secondary,
  highlight,
  rowProps,
}: TreeRowViewProps) {
  const isVersion = kind === 'version';
  const disabled = isVersion && !viewable;
  const icon: IconName = disabled ? 'ban' : KIND_ICON[kind];
  const parts = isVersion && !secondary ? versionParts(name) : null;
  const primary = parts ? parts.label : name;
  const second = parts ? parts.detail : secondary;
  const height = rowHeightFor(kind, name, secondary);
  return (
    <div
      title={name}
      {...rowProps}
      className="tree-row"
      data-kind={kind}
      data-selected={selected}
      data-focused={focused}
      data-disabled={disabled}
      data-viewable={isVersion && viewable}
      data-two-line={Boolean(second)}
      style={{
        ...rowProps?.style,
        height,
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
      <span className="tree-row__text">
        <span className="tree-row__label">
          {highlightMatch(primary, highlight)}
        </span>
        {second ? <span className="tree-row__secondary">{second}</span> : null}
      </span>
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
