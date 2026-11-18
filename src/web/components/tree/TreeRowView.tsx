import { type HTMLAttributes, type ReactNode, type Ref, useId } from 'react';
import type { TreeNodeKind } from '../../../shared/types.js';
import { type ViewState, viewableFor } from '../../../shared/viewState.js';
import { Icon, type IconName } from '../icons.js';
import { reasonFor, VIEW_STATE_COPY, viewStateOf } from './viewStateCopy.js';

export const ROW_HEIGHT = 30;
export const TWO_LINE_ROW_HEIGHT = 46;
export const INDENT = 12;

const KIND_ICON: Record<TreeNodeKind, IconName> = {
  hub: 'hub',
  project: 'project',
  folder: 'folder',
  item: 'item',
  version: 'version',
};

const BADGE_KIND: Record<ViewState, string> = {
  ready: 'viewable',
  unknown: 'unchecked',
  processing: 'processing',
  failed: 'failed',
  'no-geometry': 'muted',
  'not-translated': 'muted',
};

const VERSION_PATTERN = /^(v\S+?):\s*(.*?)\s+by\s+(.+)$/;

export interface VersionParts {
  label: string;
  date: string;
  author: string;
  detail: string;
}

export function versionParts(name: string): VersionParts | null {
  const match = VERSION_PATTERN.exec(name);
  if (!match) {
    return null;
  }
  const date = (match[2] ?? '').replace(
    /^(\d{4}-\d{2}-\d{2}) \d{2}:\d{2}$/,
    '$1',
  );
  const author = match[3] ?? '';
  return {
    label: match[1] ?? '',
    date,
    author,
    detail: date ? `${date} · ${author}` : author,
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

const TAIL_MIN = 6;

export function splitFileName(name: string): [string, string] | null {
  const extension = /\.[A-Za-z0-9]{1,6}$/.exec(name)?.[0] ?? '';
  const tail = Math.max(TAIL_MIN, extension.length + 3);
  if (name.length <= tail + TAIL_MIN) {
    return null;
  }
  return [name.slice(0, -tail), name.slice(-tail)];
}

function MiddleLabel({ name }: { name: string }) {
  const parts = splitFileName(name);
  if (!parts) {
    return <span className="tree-row__mid">{name}</span>;
  }
  return (
    <span className="tree-row__mid">
      <span className="tree-row__mid-head">{parts[0]}</span>
      <span className="tree-row__mid-tail">{parts[1]}</span>
    </span>
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
  viewState?: ViewState;
  checked?: boolean;
  busy?: boolean;
  caption?: string;
  meta?: string;
  secondary?: string;
  highlight?: string;
  picked?: boolean;
  added?: boolean;
  action?: ReactNode;
  rowProps?: HTMLAttributes<HTMLDivElement> & {
    ref?: Ref<HTMLDivElement>;
    'data-index'?: number;
  };
}

export function TreeRowView({
  level,
  kind,
  name,
  expandable = false,
  expanded = false,
  selected = false,
  focused = false,
  viewState,
  checked,
  busy = false,
  caption,
  meta,
  secondary,
  highlight,
  picked,
  added,
  action,
  rowProps,
}: TreeRowViewProps) {
  const isVersion = kind === 'version';
  const state = viewStateOf({ viewState });
  const copy = VIEW_STATE_COPY[state];
  const reason = reasonFor(state, checked);
  const reasonId = useId();
  const explained = isVersion && state !== 'ready';
  const disabled = isVersion && !viewableFor(state);
  const icon: IconName = disabled ? 'ban' : KIND_ICON[kind];
  const parts = isVersion && !secondary ? versionParts(name) : null;
  const primary = parts ? parts.label : name;
  const second = parts ? parts.detail : secondary;
  const middleTruncate = kind === 'item' && !highlight?.trim();
  const minHeight = rowHeightFor(kind, name, secondary);
  return (
    <div
      title={name}
      {...rowProps}
      className="tree-row"
      data-kind={kind}
      data-selected={selected}
      data-focused={focused}
      data-disabled={disabled}
      data-viewable={isVersion && !disabled}
      data-view-state={isVersion ? state : undefined}
      {...(explained
        ? {
            'aria-describedby': reasonId,
            title: `${name}. ${reason}`,
          }
        : {})}
      data-two-line={Boolean(second)}
      data-picked={picked || undefined}
      data-added={added || undefined}
      style={{
        ...rowProps?.style,
        minHeight,
        paddingInlineStart: `calc(var(--space-2) + ${level * INDENT}px)`,
      }}
    >
      {explained ? (
        <span id={reasonId} className="visually-hidden">
          {reason}
        </span>
      ) : null}
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
        <Icon name={picked ? 'check' : icon} size={15} />
      </span>
      <span className="tree-row__text">
        <span className="tree-row__line">
          <span className="tree-row__label">
            {middleTruncate ? (
              <MiddleLabel name={primary} />
            ) : (
              highlightMatch(primary, highlight)
            )}
          </span>
          {isVersion ? (
            <span
              className="tree-row__state"
              data-state={BADGE_KIND[state]}
              title={reason}
            >
              {state === 'processing' ? (
                <Icon name="spinner" size={10} className="spin" />
              ) : null}
              <span className="tree-row__state-text">{copy.label}</span>
            </span>
          ) : null}
        </span>
        {second ? (
          <span className="tree-row__secondary" title={second}>
            {parts ? (
              <>
                {parts.date ? (
                  <span className="tree-row__date">{parts.date}</span>
                ) : null}
                {parts.date ? <span className="tree-row__sep">·</span> : null}
                <span className="tree-row__author">{parts.author}</span>
              </>
            ) : (
              <span className="tree-row__plain">{second}</span>
            )}
          </span>
        ) : null}
      </span>
      {meta ? (
        <span className="tree-row__meta" title={meta}>
          {meta}
        </span>
      ) : null}
      {caption ? <span className="tree-row__caption">{caption}</span> : null}
      {action}
    </div>
  );
}
