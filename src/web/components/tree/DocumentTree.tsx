import {
  asyncDataLoaderFeature,
  hotkeysCoreFeature,
  type ItemInstance,
  selectionFeature,
} from '@headless-tree/core';
import { useTree } from '@headless-tree/react';
import { useQueryClient } from '@tanstack/react-query';
import { useVirtualizer, type Virtualizer } from '@tanstack/react-virtual';
import { type KeyboardEvent, useRef, useState } from 'react';
import type { TreeNode } from '../../../shared/types.js';
import { childrenQueryOptions } from '../../api/hooks.js';
import {
  childScope,
  type NodeScope,
  ROOT_ID,
  ROOT_NODE,
  ROOT_SCOPE,
} from '../../api/scope.js';
import { Icon } from '../icons.js';
import { ROW_HEIGHT, TreeRowView } from './TreeRowView.js';

export interface DocumentTreeProps {
  selectedUrn?: string;
  onOpenModel: (urn: string) => void;
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Request failed';
}

const STATUS_COPY: Record<StatusVariant, string> = {
  loading: 'Loading',
  error: 'Failed to load',
  empty: 'Nothing here yet',
};

export function DocumentTree({ selectedUrn, onOpenModel }: DocumentTreeProps) {
  const queryClient = useQueryClient();
  const [errors, setErrors] = useState<Record<string, string>>({});
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
      onOpenModel(urn);
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
          setErrors((prev) => ({ ...prev, [id]: errorMessage(error) }));
          return [];
        }
      },
    },
    features: [asyncDataLoaderFeature, selectionFeature, hotkeysCoreFeature],
  });

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
            message: errors[id],
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
          message: errors[ROOT_ID],
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
    estimateSize: () => ROW_HEIGHT,
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
        onOpenModel(urn);
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
            ref: item.registerElement,
            'aria-selected': urn !== null && urn === selectedUrn,
            'aria-disabled': disabled || undefined,
            title: disabled
              ? 'This version has no viewable geometry'
              : undefined,
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
          selected={urn !== null && urn === selectedUrn}
          rowProps={{
            role: 'option',
            tabIndex: 0,
            'aria-selected': urn !== null && urn === selectedUrn,
            'aria-disabled': disabled || undefined,
            onClick: () => {
              if (urn) {
                onOpenModel(urn);
              }
            },
            onKeyDown: (event) => onResultKeyDown(event, row.node),
            style: position,
          }}
        />
      );
    }

    return (
      <div
        key={row.key}
        className="tree-status"
        data-variant={row.variant}
        role="presentation"
        style={{
          ...position,
          height: ROW_HEIGHT,
          paddingInlineStart: `calc(var(--space-2) + ${row.level * 16 + 22}px)`,
        }}
      >
        {row.variant === 'error' ? (
          <span role="alert" className="tree-status__body">
            <Icon name="alert" size={14} />
            <span>
              {STATUS_COPY.error}
              {row.message ? `: ${row.message}` : ''}
            </span>
            <button
              type="button"
              className="tree-status__retry"
              onClick={() => retry(row.parentId)}
            >
              Retry
            </button>
          </span>
        ) : (
          <span
            role={row.variant === 'loading' ? 'status' : undefined}
            className="tree-status__body"
          >
            {row.variant === 'loading' ? (
              <Icon name="spinner" size={14} className="spin" />
            ) : null}
            <span>{row.message ?? STATUS_COPY[row.variant]}</span>
          </span>
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
          placeholder="Filter loaded nodes"
          aria-label="Filter loaded nodes"
          autoComplete="off"
          spellCheck={false}
        />
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
