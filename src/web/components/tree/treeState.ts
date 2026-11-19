import type { TreeNode, VersionViewState } from '../../../shared/types.js';
import { viewableFor } from '../../../shared/viewState.js';
import { friendlyError } from '../../api/friendlyError.js';
import { type ModelContext, versionTag } from '../../api/modelContext.js';
import { childScope, type NodeScope } from '../../api/scope.js';
import type { TreeRoot } from './docRoot.js';
import { sortChildren, type TreeSort } from './treeView.js';
import { viewStateOf } from './viewStateCopy.js';

export const VERSION_POLL_MS = 15_000;
export const CHECK_CONCURRENCY = 4;
export const TRAIL_SEPARATOR = '|';
export const REVEAL_TIMEOUT_MS = 5000;
const UNCHECKED_POLL_LIMIT = 3;
const ANCESTOR_LIMIT = 64;

export interface TreeData {
  children: (scope: NodeScope) => Promise<TreeNode[]>;
  forget: (scope: NodeScope) => void;
  viewState: (
    projectId: string,
    itemId: string,
    versionId: string,
  ) => Promise<VersionViewState>;
}

export interface TreeHost {
  folders: () => { id: string; expanded: boolean }[];
  isExpanded: (id: string) => boolean;
  expand: (id: string) => void;
  invalidate: (id: string, keepChildren?: boolean) => void;
}

export interface NodeError {
  message: string;
  detail?: string;
}

export interface TreeSnapshot {
  errors: Readonly<Record<string, NodeError>>;
  checkVersion: number;
}

export interface TreeState {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => TreeSnapshot;
  bind: (host: TreeHost) => void;
  node: (id: string) => TreeNode | undefined;
  isLoaded: (id: string) => boolean;
  search: (query: string) => TreeNode[];
  parentName: (node: TreeNode) => string | undefined;
  contextFor: (node: TreeNode) => ModelContext;
  ancestorIds: (node: TreeNode) => string[];
  children: (id: string) => Promise<TreeNode[]>;
  resolved: (node: TreeNode) => TreeNode;
  needsCheck: (node: TreeNode) => boolean;
  ensureChecked: (node: TreeNode) => Promise<TreeNode>;
  retry: (id: string) => void;
  refresh: (id: string) => void;
  refreshAll: () => void;
  refreshStale: () => void;
  recheck: (id: string) => void;
  resort: () => void;
  revealIds: (
    ids: readonly string[],
    cancelled?: () => boolean,
  ) => Promise<boolean>;
  revealTo: (node: TreeNode) => Promise<boolean>;
  pendingKey: () => string;
  poll: (pendingKey: string, pollMs: number) => () => void;
  forgetCollapsed: (expandedIds: readonly string[]) => void;
}

export interface TreeStateOptions {
  root: TreeRoot;
  data: TreeData;
  sort: () => TreeSort;
}

export function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function until(check: () => boolean, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) {
      return false;
    }
    await sleep(40);
  }
  return true;
}

export function openableUrn(node: TreeNode): string | null {
  if (node.kind === 'version' && viewableFor(viewStateOf(node)) && node.urn) {
    return node.urn;
  }
  return null;
}

function toNodeError(error: unknown): NodeError {
  return friendlyError(error, 'We could not load this. Try again.');
}

export function createTreeState({
  root,
  data,
  sort,
}: TreeStateOptions): TreeState {
  const rootId = root.node.id;
  const nodes = new Map<string, TreeNode>([[rootId, root.node]]);
  const scopes = new Map<string, NodeScope>([[rootId, root.scope]]);
  const loaded = new Set<string>();
  const stale = new Set<string>();
  const results = new Map<
    string,
    { base: TreeNode; state: VersionViewState }
  >();
  const inflight = new Map<string, Promise<TreeNode>>();
  const waiting: (() => void)[] = [];
  const attempts = new Map<string, number>();
  let active = 0;
  let host: TreeHost | null = null;
  let snapshot: TreeSnapshot = { errors: {}, checkVersion: 0 };
  const listeners = new Set<() => void>();

  const update = (patch: Partial<TreeSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
  };

  const clearError = (id: string) => {
    if (!(id in snapshot.errors)) return;
    const errors = { ...snapshot.errors };
    delete errors[id];
    update({ errors });
  };

  const scopeOf = (id: string) => scopes.get(id) ?? root.scope;

  const resolved = (node: TreeNode): TreeNode => {
    const found = results.get(node.id);
    if (!found) return node;
    if (nodes.get(node.id) !== found.base) {
      results.delete(node.id);
      return node;
    }
    return { ...node, ...found.state, checked: true };
  };

  const forgetChecks = (parentId: string) => {
    for (const [id, entry] of results) {
      if (entry.base.parentId === parentId) results.delete(id);
    }
  };

  const needsCheck = (node: TreeNode) =>
    node.kind === 'version' && node.checked === false;

  const slot = async (): Promise<void> => {
    if (active < CHECK_CONCURRENCY) {
      active += 1;
      return;
    }
    await new Promise<void>((resolve) => waiting.push(resolve));
  };

  const freeSlot = () => {
    const next = waiting.shift();
    if (next) next();
    else active -= 1;
  };

  const runCheck = async (node: TreeNode): Promise<TreeNode> => {
    const scope = scopes.get(node.id);
    const projectId =
      scope && scope.kind !== 'root' ? scope.projectId : undefined;
    if (!projectId || !node.parentId) return node;
    const base = nodes.get(node.id);
    await slot();
    let state: VersionViewState | null = null;
    try {
      state = await data.viewState(projectId, node.parentId, node.id);
    } catch {
      state = null;
    } finally {
      freeSlot();
    }
    if (!state || state.viewState === 'unknown') return node;
    if (base) {
      results.set(node.id, { base, state });
      update({ checkVersion: snapshot.checkVersion + 1 });
    }
    return { ...node, ...state, checked: true };
  };

  const ensureChecked = (input: TreeNode): Promise<TreeNode> => {
    const node = resolved(input);
    if (!needsCheck(node)) return Promise.resolve(node);
    const pending = inflight.get(node.id);
    if (pending) return pending;
    const started = runCheck(node).finally(() => {
      inflight.delete(node.id);
    });
    inflight.set(node.id, started);
    return started;
  };

  const ancestorIds = (node: TreeNode): string[] => {
    const ids: string[] = [];
    let parentId = node.parentId;
    for (let guard = 0; parentId && guard < ANCESTOR_LIMIT; guard += 1) {
      ids.unshift(parentId);
      parentId = nodes.get(parentId)?.parentId;
    }
    return ids;
  };

  const contextFor = (node: TreeNode): ModelContext => {
    const ancestors: TreeNode[] = [];
    let parentId = node.parentId;
    while (parentId && ancestors.length < ANCESTOR_LIMIT) {
      const parent = nodes.get(parentId);
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

  const retry = (id: string) => {
    const errors = { ...snapshot.errors };
    delete errors[id];
    update({ errors });
    host?.invalidate(id);
  };

  const refresh = (id: string) => {
    loaded.delete(id);
    stale.delete(id);
    data.forget(scopeOf(id));
    retry(id);
  };

  const recheck = (id: string) => {
    forgetChecks(id);
    data.forget(scopeOf(id));
    host?.invalidate(id, true);
  };

  const revealIds = async (
    ids: readonly string[],
    cancelled: () => boolean = () => false,
  ): Promise<boolean> => {
    for (const id of ids) {
      if (!(await until(() => nodes.has(id), REVEAL_TIMEOUT_MS))) {
        return false;
      }
      if (cancelled()) {
        return false;
      }
      host?.expand(id);
      if (!(await until(() => loaded.has(id), REVEAL_TIMEOUT_MS))) {
        return false;
      }
    }
    return true;
  };

  const pending = () => {
    const parents = new Set<string>();
    const processing = new Set<string>();
    for (const stored of nodes.values()) {
      const node = resolved(stored);
      if (node.kind !== 'version' || !node.parentId) {
        continue;
      }
      if (node.checked === false) {
        continue;
      }
      const state = viewStateOf(node);
      if (state === 'processing') {
        processing.add(node.parentId);
        parents.add(node.parentId);
      } else if (state === 'unknown') {
        parents.add(node.parentId);
      }
    }
    return { parents, processing };
  };

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    bind: (next) => {
      host = next;
    },
    node: (id) => nodes.get(id),
    isLoaded: (id) => loaded.has(id),
    search: (query) => {
      const found: TreeNode[] = [];
      for (const [id, node] of nodes) {
        if (id !== rootId && node.name.toLowerCase().includes(query)) {
          found.push(node);
        }
      }
      return found;
    },
    parentName: (node) =>
      node.parentId ? nodes.get(node.parentId)?.name : undefined,
    contextFor,
    ancestorIds,
    children: async (id) => {
      const scope = scopes.get(id);
      if (!scope) {
        return [];
      }
      try {
        const fetched = await data.children(scope);
        loaded.add(id);
        clearError(id);
        return sortChildren(fetched, sort()).map((node) => {
          nodes.set(node.id, node);
          scopes.set(node.id, childScope(scope, node));
          return node;
        });
      } catch (error) {
        update({ errors: { ...snapshot.errors, [id]: toNodeError(error) } });
        return [];
      }
    },
    resolved,
    needsCheck,
    ensureChecked,
    retry,
    refresh,
    refreshAll: () => {
      const ids = new Set<string>([rootId, ...Object.keys(snapshot.errors)]);
      for (const folder of host?.folders() ?? []) {
        if (folder.expanded) ids.add(folder.id);
      }
      for (const id of loaded) {
        if (!ids.has(id)) stale.add(id);
      }
      for (const id of ids) {
        forgetChecks(id);
        refresh(id);
      }
    },
    refreshStale: () => {
      if (stale.size === 0) return;
      for (const folder of host?.folders() ?? []) {
        if (stale.has(folder.id) && folder.expanded) refresh(folder.id);
      }
    },
    recheck,
    resort: () => {
      for (const folder of host?.folders() ?? []) {
        if (loaded.has(folder.id)) host?.invalidate(folder.id);
      }
    },
    revealIds,
    revealTo: (node) => revealIds(ancestorIds(node)),
    pendingKey: () => [...pending().parents].sort().join(TRAIL_SEPARATOR),
    poll: (pendingKey, pollMs) => {
      if (!pendingKey) {
        return () => undefined;
      }
      const ids = pendingKey.split(TRAIL_SEPARATOR);
      const timer = setInterval(() => {
        if (document.visibilityState === 'hidden') {
          return;
        }
        const { processing } = pending();
        for (const id of ids) {
          if (!host?.isExpanded(id)) {
            continue;
          }
          const count = attempts.get(id) ?? 0;
          if (!processing.has(id) && count >= UNCHECKED_POLL_LIMIT) {
            continue;
          }
          attempts.set(id, count + 1);
          recheck(id);
        }
      }, pollMs);
      return () => clearInterval(timer);
    },
    forgetCollapsed: (expandedIds) => {
      const expanded = new Set(expandedIds);
      for (const id of [...attempts.keys()]) {
        if (!expanded.has(id)) attempts.delete(id);
      }
    },
  };
}
