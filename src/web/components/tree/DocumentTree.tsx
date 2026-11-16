import {
  asyncDataLoaderFeature,
  hotkeysCoreFeature,
  type ItemInstance,
  selectionFeature,
} from '@headless-tree/core';
import { useTree } from '@headless-tree/react';
import { useQueryClient } from '@tanstack/react-query';
import { useVirtualizer, type Virtualizer } from '@tanstack/react-virtual';
import {
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { MAX_COMBINED_MODELS } from '../../../shared/combined.js';
import type { TreeNode, VersionViewState } from '../../../shared/types.js';
import { viewableFor } from '../../../shared/viewState.js';
import { fetchVersionViewState } from '../../api/client.js';
import { friendlyError } from '../../api/friendlyError.js';
import { childrenQueryOptions } from '../../api/hooks.js';
import { type ModelContext, versionTag } from '../../api/modelContext.js';
import {
  childScope,
  type NodeScope,
  ROOT_ID,
  ROOT_NODE,
  ROOT_SCOPE,
  scopeKey,
} from '../../api/scope.js';
import { MODEL_LIMIT_MESSAGE } from '../../viewer/modelSet.js';
import { Icon } from '../icons.js';
import { StateBlock } from '../StateBlock.js';
import { NoHubsHint, PersonalHubNotice } from './NoHubsHint.js';
import {
  INDENT,
  ROW_HEIGHT,
  rowHeightFor,
  TreeRowView,
} from './TreeRowView.js';
import {
  blockedNotice,
  VIEW_STATE_COPY,
  viewStateOf,
} from './viewStateCopy.js';

export interface PickedModel {
  urn: string;
  context: ModelContext;
}

export interface AddTarget {
  label: string;
  canAdd: (urn: string) => boolean;
  onAdd: (models: PickedModel[]) => void;
}

export interface DocumentTreeProps {
  selectedUrn?: string;
  revealTrail?: readonly string[];
  onOpenModel: (urn: string, context: ModelContext) => void;
  onOpenTogether?: (models: PickedModel[]) => void;
  addTarget?: AddTarget | null;
  pollMs?: number;
}

export function skippedNotice(nodes: readonly TreeNode[]): {
  title: string;
  message: string;
} {
  const states = [...new Set(nodes.map((node) => viewStateOf(node)))];
  const count = nodes.length;
  const labels = states.map((state) => VIEW_STATE_COPY[state].label);
  return {
    title: `Skipped ${count} ${count === 1 ? 'version' : 'versions'} that cannot be opened: ${labels.join(', ')}`,
    message: states.map((state) => VIEW_STATE_COPY[state].reason).join(' '),
  };
}

function pickLabel(model: PickedModel): string {
  return model.context.file ?? model.urn;
}

export const VERSION_POLL_MS = 15_000;
export const CHECK_CONCURRENCY = 4;
const UNCHECKED_POLL_LIMIT = 3;

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
      title?: string;
      message?: string;
      detail?: string;
      clearFilter?: boolean;
      noHubs?: boolean;
    };

const LOADING_NODE: TreeNode = {
  id: 'loading',
  kind: 'folder',
  name: 'Loading',
  hasChildren: false,
  viewable: false,
};

function openableUrn(node: TreeNode): string | null {
  if (node.kind === 'version' && viewableFor(viewStateOf(node)) && node.urn) {
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
  empty: 'Nothing here yet.',
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
  onOpenTogether,
  addTarget,
  pollMs = VERSION_POLL_MS,
}: DocumentTreeProps) {
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState<PickedModel[]>([]);
  const anchorRef = useRef<string | null>(null);
  const [errors, setErrors] = useState<Record<string, NodeError>>({});
  const [filter, setFilter] = useState('');
  const [notice, setNotice] = useState<{
    title: string;
    message: string;
    itemId?: string;
  } | null>(null);
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

  const [, setCheckVersion] = useState(0);
  const checks = useRef({
    results: new Map<string, { base: TreeNode; state: VersionViewState }>(),
    inflight: new Map<string, Promise<TreeNode>>(),
    waiting: [] as (() => void)[],
    active: 0,
  }).current;

  const resolved = (node: TreeNode): TreeNode => {
    const found = checks.results.get(node.id);
    if (!found) return node;
    if (registry.nodes.get(node.id) !== found.base) {
      checks.results.delete(node.id);
      return node;
    }
    return { ...node, ...found.state, checked: true };
  };

  const forgetChecks = (parentId: string) => {
    for (const [id, entry] of checks.results) {
      if (entry.base.parentId === parentId) checks.results.delete(id);
    }
  };

  const needsCheck = (node: TreeNode) =>
    node.kind === 'version' && node.checked === false;

  const slot = async (): Promise<void> => {
    if (checks.active < CHECK_CONCURRENCY) {
      checks.active += 1;
      return;
    }
    await new Promise<void>((resolve) => checks.waiting.push(resolve));
  };

  const freeSlot = () => {
    const next = checks.waiting.shift();
    if (next) next();
    else checks.active -= 1;
  };

  const runCheck = async (node: TreeNode): Promise<TreeNode> => {
    const scope = registry.scopes.get(node.id);
    const projectId =
      scope && scope.kind !== 'root' ? scope.projectId : undefined;
    if (!projectId || !node.parentId) return node;
    const base = registry.nodes.get(node.id);
    await slot();
    let state: VersionViewState | null = null;
    try {
      state = await fetchVersionViewState(projectId, node.parentId, node.id);
    } catch {
      state = null;
    } finally {
      freeSlot();
    }
    if (!state || state.viewState === 'unknown') return node;
    if (base) {
      checks.results.set(node.id, { base, state });
      setCheckVersion((version) => version + 1);
    }
    return { ...node, ...state, checked: true };
  };

  const ensureChecked = (input: TreeNode): Promise<TreeNode> => {
    const node = resolved(input);
    if (!needsCheck(node)) return Promise.resolve(node);
    const pending = checks.inflight.get(node.id);
    if (pending) return pending;
    const started = runCheck(node).finally(() => {
      checks.inflight.delete(node.id);
    });
    checks.inflight.set(node.id, started);
    return started;
  };

  const openNode = (input: TreeNode) => {
    const node = resolved(input);
    if (needsCheck(node)) {
      void ensureChecked(node).then(openChecked);
      return;
    }
    openChecked(node);
  };

  const openChecked = (node: TreeNode) => {
    const urn = openableUrn(node);
    if (urn) {
      setNotice(null);
      onOpenModel(urn, contextFor(node));
      return;
    }
    const message = blockedNotice(node);
    if (message) {
      setNotice({
        title: `${versionTag(node.name) ?? node.name} cannot be opened`,
        message,
        itemId: node.parentId,
      });
    }
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
    openNode(node);
  };

  const pickedUrns = new Set(picked.map((model) => model.urn));

  const isBlocked = (node: TreeNode) =>
    node.kind === 'version' && openableUrn(node) === null;

  const togglePick = (input: TreeNode) => {
    const node = resolved(input);
    if (needsCheck(node)) {
      void ensureChecked(node).then(pickChecked);
      return;
    }
    pickChecked(node);
  };

  const pickChecked = (node: TreeNode) => {
    if (isBlocked(node)) {
      openChecked(node);
      return;
    }
    const urn = openableUrn(node);
    if (!urn) return;
    anchorRef.current = node.id;
    setPicked((current) =>
      current.some((model) => model.urn === urn)
        ? current.filter((model) => model.urn !== urn)
        : [...current, { urn, context: contextFor(node) }],
    );
  };

  const pickRange = (node: TreeNode) => {
    const listed = rowsRef.current.flatMap((row) => {
      const data =
        row.type === 'node'
          ? row.item.getItemData()
          : row.type === 'result'
            ? row.node
            : null;
      return data?.kind === 'version' ? [resolved(data)] : [];
    });
    const from = listed.findIndex((entry) => entry.id === anchorRef.current);
    const to = listed.findIndex((entry) => entry.id === node.id);
    const range =
      from === -1 || to === -1
        ? listed.filter((entry) => entry.id === node.id)
        : listed.slice(Math.min(from, to), Math.max(from, to) + 1);
    if (range.some(needsCheck)) {
      void Promise.all(range.map(ensureChecked)).then((checked) => {
        const byId = new Map(checked.map((entry) => [entry.id, entry]));
        pickRangeOf(
          listed.map((entry) => byId.get(entry.id) ?? entry),
          node,
        );
      });
      return;
    }
    pickRangeOf(listed, node);
  };

  const pickRangeOf = (versions: TreeNode[], node: TreeNode) => {
    const from = versions.findIndex((entry) => entry.id === anchorRef.current);
    const to = versions.findIndex((entry) => entry.id === node.id);
    if (from === -1 || to === -1) {
      pickChecked(versions[to] ?? resolved(node));
      return;
    }
    const [start, end] = from < to ? [from, to] : [to, from];
    const range = versions.slice(start, end + 1);
    const skipped = range.filter(isBlocked);
    setPicked((current) => {
      const next = [...current];
      for (const entry of range) {
        const id = openableUrn(entry);
        if (id && !next.some((model) => model.urn === id)) {
          next.push({ urn: id, context: contextFor(entry) });
        }
      }
      return next;
    });
    if (skipped.length > 0) setNotice(skippedNotice(skipped));
    else setNotice(null);
  };

  const onPickClick = (event: MouseEvent, node: TreeNode): boolean => {
    if (node.kind !== 'version') return false;
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      if (isBlocked(node)) openNode(node);
      else togglePick(node);
      return true;
    }
    if (event.shiftKey) {
      event.preventDefault();
      pickRange(node);
      return true;
    }
    return false;
  };

  const onPickKey = (event: KeyboardEvent, node: TreeNode): boolean => {
    if (event.key !== ' ' || node.kind !== 'version') return false;
    event.preventDefault();
    event.stopPropagation();
    if (isBlocked(node)) openNode(node);
    else togglePick(node);
    return true;
  };

  const rowAction = (node: TreeNode) => {
    const urn = openableUrn(node);
    if (!urn || !addTarget?.canAdd(urn)) return null;
    const label = `Add ${contextFor(node).file ?? node.name} to ${addTarget.label}`;
    return (
      <button
        type="button"
        className="tree-row__action"
        tabIndex={-1}
        aria-label={label}
        title={`${label}. With the keyboard, press Space to select the version, then use Add to ${addTarget.label} in the selection bar.`}
        onClick={(event) => {
          event.stopPropagation();
          void ensureChecked(node).then((checked) => {
            if (openableUrn(checked)) {
              addTarget.onAdd([{ urn, context: contextFor(checked) }]);
            } else {
              openChecked(checked);
            }
          });
        }}
      >
        <Icon name="plus" size={13} />
      </button>
    );
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
        title: 'Nothing found',
        message: `No matches for “${filter.trim()}” in loaded folders. Expand more folders to search deeper.`,
        clearFilter: true,
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
            title: 'Could not load this folder',
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
            title: 'Empty folder',
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
          title: 'Could not load hubs',
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
          title: 'No hubs found',
          message: 'Add your Autodesk account to a hub, then refresh.',
          noHubs: true,
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

  const refresh = (id: string) => {
    registry.loaded.delete(id);
    queryClient.removeQueries({
      queryKey: scopeKey(registry.scopes.get(id) ?? ROOT_SCOPE),
      exact: true,
    });
    retry(id);
  };

  const recheck = (id: string) => {
    forgetChecks(id);
    queryClient.removeQueries({
      queryKey: scopeKey(registry.scopes.get(id) ?? ROOT_SCOPE),
      exact: true,
    });
    void tree.getItemInstance(id).invalidateChildrenIds(true);
  };

  const pendingParents = new Set<string>();
  const processingParents = new Set<string>();
  for (const stored of registry.nodes.values()) {
    const node = resolved(stored);
    if (node.kind !== 'version' || !node.parentId) {
      continue;
    }
    if (node.checked === false) {
      continue;
    }
    const state = viewStateOf(node);
    if (state === 'processing') {
      processingParents.add(node.parentId);
      pendingParents.add(node.parentId);
    } else if (state === 'unknown') {
      pendingParents.add(node.parentId);
    }
  }
  const pendingKey = [...pendingParents].sort().join(TRAIL_SEPARATOR);
  const recheckRef = useRef(recheck);
  recheckRef.current = recheck;
  const processingRef = useRef(processingParents);
  processingRef.current = processingParents;
  const attemptsRef = useRef(new Map<string, number>());
  const expandedKey = (tree.getState().expandedItems ?? []).join(
    TRAIL_SEPARATOR,
  );

  useEffect(() => {
    const expanded = new Set(expandedKey.split(TRAIL_SEPARATOR));
    for (const id of [...attemptsRef.current.keys()]) {
      if (!expanded.has(id)) attemptsRef.current.delete(id);
    }
  }, [expandedKey]);

  useEffect(() => {
    if (!pendingKey) {
      return;
    }
    const ids = pendingKey.split(TRAIL_SEPARATOR);
    const timer = setInterval(() => {
      if (document.visibilityState === 'hidden') {
        return;
      }
      for (const id of ids) {
        if (!tree.getItemInstance(id).isExpanded()) {
          continue;
        }
        const attempts = attemptsRef.current.get(id) ?? 0;
        if (
          !processingRef.current.has(id) &&
          attempts >= UNCHECKED_POLL_LIMIT
        ) {
          continue;
        }
        attemptsRef.current.set(id, attempts + 1);
        recheckRef.current(id);
      }
    }, pollMs);
    return () => clearInterval(timer);
  }, [pendingKey, pollMs, tree]);

  const filterDisabled = !query && !rows.some((row) => row.type === 'node');

  const containerProps: Record<string, unknown> = query
    ? { role: 'listbox', 'aria-label': 'Filter results' }
    : tree.getContainerProps('Documents');

  const onResultKeyDown = (event: KeyboardEvent, node: TreeNode) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openNode(node);
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
      const node = resolved(item.getItemData());
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
          viewState={viewStateOf(node)}
          checked={node.checked}
          picked={urn !== null && pickedUrns.has(urn)}
          action={rowAction(node)}
          rowProps={{
            ...props,
            'data-index': index,
            'aria-checked':
              urn !== null && onOpenTogether ? pickedUrns.has(urn) : undefined,
            onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
              if (onOpenTogether && onPickKey(event, node)) return;
              (
                props as {
                  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
                }
              ).onKeyDown?.(event);
            },
            ref: (element: HTMLDivElement | null) => {
              item.registerElement(element);
              virtualizer.measureElement(element);
            },
            'aria-selected': urn !== null && urn === selectedUrn,
            'aria-disabled': disabled || undefined,
            onClick: (event: MouseEvent<HTMLDivElement>) => {
              item.setFocused();
              if (onOpenTogether && onPickClick(event, node)) return;
              activate(item);
            },
            style: position,
          }}
        />
      );
    }

    if (row.type === 'result') {
      const resultNode = resolved(row.node);
      const urn = openableUrn(resultNode);
      const disabled = resultNode.kind === 'version' && urn === null;
      return (
        <TreeRowView
          key={row.key}
          level={0}
          kind={resultNode.kind}
          name={resultNode.name}
          viewState={viewStateOf(resultNode)}
          checked={resultNode.checked}
          caption={resultNode.kind === 'version' ? undefined : resultNode.kind}
          secondary={parentName(resultNode)}
          highlight={query}
          selected={urn !== null && urn === selectedUrn}
          picked={urn !== null && pickedUrns.has(urn)}
          action={rowAction(resultNode)}
          rowProps={{
            role: 'option',
            'aria-checked':
              urn !== null && onOpenTogether ? pickedUrns.has(urn) : undefined,
            'data-index': index,
            ref: virtualizer.measureElement,
            tabIndex: 0,
            'aria-selected': urn !== null && urn === selectedUrn,
            'aria-disabled': disabled || undefined,
            onClick: (event: MouseEvent<HTMLDivElement>) => {
              if (onOpenTogether && onPickClick(event, resultNode)) return;
              openNode(resultNode);
            },
            onKeyDown: (event) => {
              if (onOpenTogether && onPickKey(event, resultNode)) return;
              onResultKeyDown(event, resultNode);
            },
            style: position,
          }}
        />
      );
    }

    const indent = `calc(var(--space-2) + ${row.level * INDENT + 20}px)`;
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
            title={row.title}
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
        ) : row.noHubs ? (
          <NoHubsHint onCheckAgain={() => refresh(row.parentId)} />
        ) : (
          <StateBlock
            variant="empty"
            compact
            icon={row.clearFilter ? 'search' : 'folder'}
            title={row.title}
            message={row.message ?? STATUS_COPY.empty}
            action={
              row.clearFilter
                ? { label: 'Show all', onClick: () => setFilter('') }
                : { label: 'Refresh', onClick: () => refresh(row.parentId) }
            }
          />
        )}
      </div>
    );
  };

  return (
    <div className="doc-tree">
      <PersonalHubNotice onCheckAgain={() => refresh(ROOT_ID)} />
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
          disabled={filterDisabled}
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
      {onOpenTogether ? (
        <PickBar
          picked={picked}
          addTarget={addTarget ?? null}
          onOpenTogether={(models) => {
            onOpenTogether(models);
            setPicked([]);
          }}
          onClear={() => setPicked([])}
        />
      ) : null}
      <div className="doc-tree__notice" role="status" aria-live="polite">
        {notice ? (
          <StateBlock
            variant="empty"
            compact
            icon="alert"
            title={notice.title}
            message={notice.message}
            action={
              notice.itemId
                ? {
                    label: 'Check again',
                    onClick: () => {
                      recheck(notice.itemId as string);
                      setNotice(null);
                    },
                  }
                : { label: 'Dismiss', onClick: () => setNotice(null) }
            }
          >
            {notice.itemId ? (
              <button
                type="button"
                className="btn btn-small"
                onClick={() => setNotice(null)}
              >
                Dismiss
              </button>
            ) : null}
          </StateBlock>
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

function PickBar({
  picked,
  addTarget,
  onOpenTogether,
  onClear,
}: {
  picked: PickedModel[];
  addTarget: AddTarget | null;
  onOpenTogether: (models: PickedModel[]) => void;
  onClear: () => void;
}) {
  const tooMany = picked.length > MAX_COMBINED_MODELS;
  const addable = addTarget
    ? picked.filter((model) => addTarget.canAdd(model.urn))
    : [];
  return (
    <section
      className="doc-tree__picks"
      data-empty={picked.length === 0}
      aria-label="Selected versions"
    >
      <span className="doc-tree__picks-count" aria-live="polite">
        {picked.length === 0
          ? 'Ctrl or Cmd click, Shift click or Space selects versions to open together'
          : `${picked.length} selected`}
      </span>
      {picked.length > 0 ? (
        <>
          <button
            type="button"
            className="bsh-button doc-tree__pick-action"
            disabled={picked.length < 2 || tooMany}
            title={picked.map(pickLabel).join('\n')}
            onClick={() => onOpenTogether(picked)}
          >
            Open together
          </button>
          {addTarget ? (
            <button
              type="button"
              className="bsh-button doc-tree__pick-action"
              disabled={addable.length === 0}
              onClick={() => {
                addTarget.onAdd(addable);
                onClear();
              }}
            >
              Add to {addTarget.label}
            </button>
          ) : null}
          <button
            type="button"
            className="bsh-button doc-tree__pick-action"
            onClick={onClear}
          >
            Clear
          </button>
          {tooMany ? (
            <span className="doc-tree__picks-limit" role="alert">
              {MODEL_LIMIT_MESSAGE}
            </span>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
