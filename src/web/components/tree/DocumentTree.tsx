import {
  asyncDataLoaderFeature,
  hotkeysCoreFeature,
  type ItemInstance,
  selectionFeature,
} from '@headless-tree/core';
import { useTree } from '@headless-tree/react';
import { useQueryClient } from '@tanstack/react-query';
import { useVirtualizer, type Virtualizer } from '@tanstack/react-virtual';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import type { TreeNode } from '../../../shared/types.js';
import { friendlyError } from '../../api/friendlyError.js';
import { childrenQueryOptions } from '../../api/hooks.js';
import { type ModelContext, versionTag } from '../../api/modelContext.js';
import {
  childScope,
  type NodeScope,
  ROOT_ID,
  ROOT_NODE,
  ROOT_SCOPE,
} from '../../api/scope.js';
import { Icon } from '../icons.js';
import { StateBlock } from '../StateBlock.js';
import { ROW_HEIGHT, rowHeightFor, TreeRowView } from './TreeRowView.js';

export interface DocumentTreeProps {
  selectedUrn?: string;
  revealTrail?: readonly string[];
  onOpenModel: (urn: string, context: ModelContext) => void;
}

type StatusVariant = 'loading' | 'error' | 'empty';

type Row =
  | { type: 'node'; key: string; item: ItemInstance<TreeNode> }
  | { type: 'result'; key: string; node: TreeNode }
  | {
      type: 'status';
      key: string;
      variant: StatusVariant;
      level: number;
      parentId: string;
      message?: string;
      detail?: string;
    };

const LOADING_NODE: TreeNode = {
  id: 'loading',
  kind: 'folder',
  name: 'Loading',
  hasChildren: false,
  viewable: false,
};

function openableUrn(node: TreeNode): string | null {
  if (node.kind === 'version' && node.viewable && node.urn) {
    return node.urn;
  }
  return null;
}

interface NodeError {
  message: string;
  detail?: string;
}

function toNodeError(error: unknown): NodeError {
  return friendlyError(error, 'We could not load this. Try again.');
}

const STATUS_COPY: Record<StatusVariant, string> = {
  loading: 'Loading',
  error: 'We could not load this. Try again.',
  empty: 'Nothing here yet',
};

const MIN_ROW_HEIGHT = 30;

const TRAIL_SEPARATOR = '|';
const REVEAL_TIMEOUT_MS = 5000;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function until(check: () => boolean, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) {
      return false;
    }
    await sleep(40);
  }
  return true;
}

export function DocumentTree({
  selectedUrn,
  revealTrail,
  onOpenModel,
}: DocumentTreeProps) {
  const queryClient = useQueryClient();
  const [errors, setErrors] = useState<Record<string, NodeError>>({});
  const [filter, setFilter] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<Row[]>([]);
  const virtualizerRef = useRef<Virtualizer<HTMLDivElement, Element> | null>(
    null,
  );
  const registry = useRef({
    nodes: new Map<string, TreeNode>([[ROOT_ID, ROOT_NODE]]),
    scopes: new Map<string, NodeScope>([[ROOT_ID, ROOT_SCOPE]]),
    loaded: new Set<string>(),
  }).current;

  const selectedUrnRef = useRef(selectedUrn);
  selectedUrnRef.current = selectedUrn;

  const parentName = (node: TreeNode): string | undefined =>
    node.parentId ? registry.nodes.get(node.parentId)?.name : undefined;

  const contextFor = (node: TreeNode): ModelContext => {
    const ancestors: TreeNode[] = [];
    let parentId = node.parentId;
    while (parentId && ancestors.length < 64) {
      const parent = registry.nodes.get(parentId);
      if (!parent) {
        break;
      }
      ancestors.unshift(parent);
      parentId = parent.parentId;
    }
    const owner = ancestors[ancestors.length - 1];
    const container =
      owner?.kind === 'item' ? ancestors.slice(0, -1) : ancestors;
    const context: ModelContext = {
      trail: ancestors.map((ancestor) => ancestor.id),
      crumbs: container.map((ancestor) => ancestor.name),
    };
    if (owner?.kind === 'item') {
      context.file = owner.name;
    }
    const tag = versionTag(node.name);
    if (tag) {
      context.v = tag;
    }
    return context;
  };

  const activate = (item: ItemInstance<TreeNode>) => {
    const node = item.getItemData();
    if (item.isFolder()) {
      if (item.isExpanded()) {
        item.collapse();
      } else {
        item.expand();
      }
      return;
    }
    const urn = openableUrn(node);
    if (urn) {
      onOpenModel(urn, contextFor(node));
    }
  };

  const tree = useTree<TreeNode>({
    rootItemId: ROOT_ID,
    getItemName: (item) => item.getItemData().name,
    isItemFolder: (item) => item.getItemData().hasChildren,
    createLoadingItemData: () => LOADING_NODE,
    onPrimaryAction: activate,
    scrollToItem: (item) => {
      const index = rowsRef.current.findIndex(
        (row) => row.type === 'node' && row.item.getId() === item.getId(),
      );
      if (index >= 0) {
        virtualizerRef.current?.scrollToIndex(index);
      }
    },
    dataLoader: {
      getItem: (id) => registry.nodes.get(id) ?? LOADING_NODE,
      getChildrenWithData: async (id) => {
        const scope = registry.scopes.get(id);
        if (!scope) {
          return [];
        }
        try {
          const nodes = await queryClient.fetchQuery(
            childrenQueryOptions(scope),
          );
          registry.loaded.add(id);
          setErrors((prev) => {
            if (!(id in prev)) {
              return prev;
            }
            const next = { ...prev };
            delete next[id];
            return next;
          });
          return nodes.map((node) => {
            registry.nodes.set(node.id, node);
            registry.scopes.set(node.id, childScope(scope, node));
            return { id: node.id, data: node };
          });
        } catch (error) {
          setErrors((prev) => ({ ...prev, [id]: toNodeError(error) }));
          return [];
        }
      },
    },
    features: [asyncDataLoaderFeature, selectionFeature, hotkeysCoreFeature],
  });

  const revealKey = revealTrail?.join(TRAIL_SEPARATOR) ?? '';
  useEffect(() => {
    if (!revealKey) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        for (const id of revealKey.split(TRAIL_SEPARATOR)) {
          if (!(await until(() => registry.nodes.has(id), REVEAL_TIMEOUT_MS))) {
            return;
          }
          if (cancelled) {
            return;
          }
          const item = tree.getItemInstance(id);
          if (!item.isExpanded()) {
            item.expand();
          }
          if (
            !(await until(() => registry.loaded.has(id), REVEAL_TIMEOUT_MS))
          ) {
            return;
          }
        }
        await sleep(80);
        const target = selectedUrnRef.current;
        const index = rowsRef.current.findIndex(
          (row) =>
            row.type === 'node' &&
            openableUrn(row.item.getItemData()) === target,
        );
        if (!cancelled && index >= 0) {
          virtualizerRef.current?.scrollToIndex(index, { align: 'center' });
        }
      } catch {
        return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [revealKey, registry, tree]);

  const query = filter.trim().toLowerCase();

  const rows: Row[] = [];
  if (query) {
    for (const [id, node] of registry.nodes) {
      if (id !== ROOT_ID && node.name.toLowerCase().includes(query)) {
        rows.push({ type: 'result', key: `result:${id}`, node });
      }
    }
    if (rows.length === 0) {
      rows.push({
        type: 'status',
        key: 'status:search',
        variant: 'empty',
        level: 0,
        parentId: ROOT_ID,
        message: 'No loaded nodes match',
      });
    }
  } else {
    const rootItem = tree.getItemInstance(ROOT_ID);
    const items = tree.getItems();
    for (const item of items) {
      const id = item.getId();
      const level = item.getItemMeta().level;
      rows.push({ type: 'node', key: id, item });
      if (item.isFolder() && item.isExpanded()) {
        const childCount = tree.retrieveChildrenIds(id, true).length;
        if (errors[id]) {
          rows.push({
            type: 'status',
            key: `status:${id}`,
            variant: 'error',
            level: level + 1,
            parentId: id,
            message: errors[id]?.message,
            detail: errors[id]?.detail,
          });
        } else if (item.isLoading() && childCount === 0) {
          rows.push({
            type: 'status',
            key: `status:${id}`,
            variant: 'loading',
            level: level + 1,
            parentId: id,
          });
        } else if (registry.loaded.has(id) && childCount === 0) {
          rows.push({
            type: 'status',
            key: `status:${id}`,
            variant: 'empty',
            level: level + 1,
            parentId: id,
          });
        }
      }
    }
    if (items.length === 0) {
      if (errors[ROOT_ID]) {
        rows.push({
          type: 'status',
          key: 'status:root',
          variant: 'error',
          level: 0,
          parentId: ROOT_ID,
          message: errors[ROOT_ID]?.message,
          detail: errors[ROOT_ID]?.detail,
        });
      } else if (registry.loaded.has(ROOT_ID)) {
        rows.push({
          type: 'status',
          key: 'status:root',
          variant: 'empty',
          level: 0,
          parentId: ROOT_ID,
          message: 'No hubs available for this account',
        });
      } else if (rootItem.isLoading() || !registry.loaded.has(ROOT_ID)) {
        rows.push({
          type: 'status',
          key: 'status:root',
          variant: 'loading',
          level: 0,
          parentId: ROOT_ID,
        });
      }
    }
  }
  rowsRef.current = rows;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      const row = rows[index];
      if (row?.type === 'node') {
        const node = row.item.getItemData();
        return rowHeightFor(node.kind, node.name);
      }
      if (row?.type === 'result') {
        return rowHeightFor(row.node.kind, row.node.name, parentName(row.node));
      }
      return row?.type === 'status' && row.variant === 'loading'
        ? MIN_ROW_HEIGHT + 40
        : MIN_ROW_HEIGHT;
    },
    measureElement: (element, _entry, instance) => {
      const measured = element.getBoundingClientRect().height;
      if (measured > 0) {
        return measured;
      }
      const index = Number(element.getAttribute('data-index'));
      return instance.options.estimateSize(index);
    },
    overscan: 8,
    getItemKey: (index) => rows[index]?.key ?? index,
  });
  virtualizerRef.current = virtualizer;

  const retry = (id: string) => {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    void tree.getItemInstance(id).invalidateChildrenIds();
  };

  const containerProps: Record<string, unknown> = query
    ? { role: 'listbox', 'aria-label': 'Filter results' }
    : tree.getContainerProps('Documents');

  const onResultKeyDown = (event: KeyboardEvent, node: TreeNode) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const urn = openableUrn(node);
      if (urn) {
        onOpenModel(urn, contextFor(node));
      }
    }
  };

  const renderRow = (index: number) => {
    const row = rows[index];
    const virtual = virtualizer
      .getVirtualItems()
      .find((v) => v.index === index);
    if (!row || !virtual) {
      return null;
    }
    const position = {
      position: 'absolute' as const,
      top: 0,
      left: 0,
      width: '100%',
      transform: `translateY(${virtual.start}px)`,
    };

    if (row.type === 'node') {
      const item = row.item;
      const node = item.getItemData();
      const meta = item.getItemMeta();
      const urn = openableUrn(node);
      const disabled = node.kind === 'version' && urn === null;
      const props = item.getProps();
      return (
        <TreeRowView
          key={row.key}
          level={meta.level}
          kind={node.kind}
          name={node.name}
          expandable={item.isFolder()}
          expanded={item.isExpanded()}
          busy={item.isLoading() && item.isExpanded()}
          selected={urn !== null && urn === selectedUrn}
          focused={item.isFocused()}
          viewable={node.viewable}
          rowProps={{
            ...props,
            'data-index': index,
            ref: (element: HTMLDivElement | null) => {
              item.registerElement(element);
              virtualizer.measureElement(element);
            },
            'aria-selected': urn !== null && urn === selectedUrn,
            'aria-disabled': disabled || undefined,
            ...(disabled
              ? { title: `${node.name}: no viewable geometry` }
              : {}),
            onClick: () => {
              item.setFocused();
              activate(item);
            },
            style: position,
          }}
        />
      );
    }

    if (row.type === 'result') {
      const urn = openableUrn(row.node);
      const disabled = row.node.kind === 'version' && urn === null;
      return (
        <TreeRowView
          key={row.key}
          level={0}
          kind={row.node.kind}
          name={row.node.name}
          viewable={row.node.viewable}
          caption={row.node.kind === 'version' ? undefined : row.node.kind}
          secondary={parentName(row.node)}
          highlight={query}
          selected={urn !== null && urn === selectedUrn}
          rowProps={{
            role: 'option',
            'data-index': index,
            ref: virtualizer.measureElement,
            tabIndex: 0,
            'aria-selected': urn !== null && urn === selectedUrn,
            'aria-disabled': disabled || undefined,
            onClick: () => {
              if (urn) {
                onOpenModel(urn, contextFor(row.node));
              }
            },
            onKeyDown: (event) => onResultKeyDown(event, row.node),
            style: position,
          }}
        />
      );
    }

    const indent = `calc(var(--space-2) + ${row.level * 16 + 20}px)`;
    return (
      <div
        key={row.key}
        ref={virtualizer.measureElement}
        data-index={index}
        className="tree-status"
        data-variant={row.variant}
        role="presentation"
        style={{
          ...position,
          minHeight: ROW_HEIGHT,
          paddingInlineStart: indent,
        }}
      >
        {row.variant === 'error' ? (
          <StateBlock
            variant="error"
            compact
            message={row.message ?? STATUS_COPY.error}
            detail={row.detail}
            action={{ label: 'Retry', onClick: () => retry(row.parentId) }}
          />
        ) : row.variant === 'loading' ? (
          <StateBlock
            variant="loading"
            compact
            rows={row.parentId === ROOT_ID ? 4 : 2}
          />
        ) : (
          <StateBlock
            variant="empty"
            compact
            icon="folder"
            message={row.message ?? STATUS_COPY.empty}
          />
        )}
      </div>
    );
  };

  return (
    <div className="doc-tree">
      <div className="doc-tree__search">
        <Icon name="search" size={14} />
        <input
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && filter) {
              event.stopPropagation();
              setFilter('');
            }
          }}
          placeholder="Filter loaded nodes"
          aria-label="Filter loaded nodes"
          autoComplete="off"
          spellCheck={false}
        />
        {filter ? (
          <button
            type="button"
            className="doc-tree__clear"
            aria-label="Clear filter"
            title="Clear filter"
            onClick={() => setFilter('')}
          >
            <Icon name="close" size={14} />
          </button>
        ) : null}
      </div>
      <div ref={scrollRef} className="doc-tree__scroll">
        <div
          {...containerProps}
          className="doc-tree__canvas"
          style={{
            ...(containerProps.style as object | undefined),
            height: virtualizer.getTotalSize(),
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((v) => renderRow(v.index))}
        </div>
      </div>
    </div>
  );
}
