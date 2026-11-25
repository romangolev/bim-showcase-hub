import {
  asyncDataLoaderFeature,
  hotkeysCoreFeature,
  type ItemInstance,
  selectionFeature,
} from '@headless-tree/core';
import { useTree } from '@headless-tree/react';
import { useVirtualizer, type Virtualizer } from '@tanstack/react-virtual';
import {
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { TreeNode } from '../../../shared/types.js';
import { thumbnailPath } from '../../api/client.js';
import type { ModelContext } from '../../api/modelContext.js';
import { listRecentModels } from '../../api/modelStore.js';
import { EMPTY_OPEN_MODELS } from '../../api/openModels.js';
import type { NodeScope } from '../../api/scope.js';
import { COMMANDS } from '../../commands/registry.js';
import { writeClipboard } from '../../extensions/clipboard.js';
import { saveModelSetPrompt } from '../../panels/ModelSets.js';
import { PANE_SETTINGS } from '../../settings/paneSettings.js';
import { usePersisted } from '../../storage.js';
import { notify } from '../../tasks/notifications.js';
import { Button } from '../../ui/Button.js';
import { Input } from '../../ui/Input.js';
import { previewOpen } from '../../viewer/openModels.js';
import { Icon } from '../icons.js';
import { Menu, type MenuEntry } from '../Menu.js';
import { StateBlock } from '../StateBlock.js';
import type { DeepSearchView } from './deepSearch.js';
import { onDeepSearch } from './deepSearchSignal.js';
import { startModelDrag } from './docDrag.js';
import { DEFAULT_TREE_ROOT, type TreeRoot } from './docRoot.js';
import { IfcBatchBubble } from './IfcBatchBubble.js';
import { NoHubsHint, PersonalHubNotice } from './NoHubsHint.js';
import { PickBar, type PreviewOpen } from './PickBar.js';
import { PreviewCard } from './PreviewCard.js';
import { usePins } from './pins.js';
import {
  itemMenuEntries,
  modelHref,
  modelMenuEntries,
  useRowMenu,
} from './rowMenu.js';
import { INDENT, rowHeightFor, TreeRowView } from './TreeRowView.js';
import { treeCommands } from './treeCommands.js';
import {
  type ItemRef,
  openableUrn,
  type PickedModel,
  skippedNotice,
  sleep,
  TRAIL_SEPARATOR,
  VERSION_POLL_MS,
} from './treeState.js';
import { type ItemOpen, metaText } from './treeView.js';
import { useTreeState } from './useTreeState.js';
import { pickLastOpened, pickLatest } from './versionPick.js';
import { viewStateOf } from './viewStateCopy.js';

export type { PickedModel };

export interface AddTarget {
  label: string;
  canAdd: (urn: string) => boolean;
  has: (urn: string) => boolean;
  onAdd: (models: PickedModel[]) => void;
  onRemove: (urn: string) => void;
}

const previewEmpty: PreviewOpen = (models, mode) =>
  previewOpen(EMPTY_OPEN_MODELS, { models, mode });

export interface DocumentTreeProps {
  selectedUrn?: string;
  revealTrail?: readonly string[];
  pickPreview?: PreviewOpen;
  onOpenModel: (urn: string, context: ModelContext) => void;
  onOpenTabs?: (models: PickedModel[]) => void;
  onOpenTogether?: (models: PickedModel[]) => void;
  onExportIfc?: (models: PickedModel[]) => boolean | undefined;
  ifcBatch?: { active: boolean; stop: () => void };
  onOpenModal?: (urn: string, context: ModelContext) => void;
  addTarget?: AddTarget | null;
  root?: TreeRoot;
  pollMs?: number;
}

export { CHECK_CONCURRENCY, VERSION_POLL_MS } from './treeState.js';
export { skippedNotice };

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

const STATUS_COPY: Record<StatusVariant, string> = {
  loading: 'Loading',
  error: 'We could not load this. Try again.',
  empty: 'Nothing here yet.',
};

interface RootCopy {
  error: string;
  empty: string;
  emptyMessage: string;
}

function rootCopy(scope: NodeScope): RootCopy {
  if (scope.kind === 'hub') {
    return {
      error: 'Could not load this hub',
      empty: 'No projects here yet',
      emptyMessage: 'Ask a hub admin to add a project, then refresh.',
    };
  }
  if (scope.kind === 'project') {
    return {
      error: 'Could not load this project',
      empty: 'No folders here yet',
      emptyMessage: 'This project has no top folders to browse.',
    };
  }
  return {
    error: 'Could not load hubs',
    empty: 'No hubs found',
    emptyMessage: 'Add your Autodesk account to a hub, then refresh.',
  };
}

const MIN_ROW_HEIGHT = 30;

const TYPEAHEAD_MS = 600;

const PREVIEW_HOVER_MS = 600;

const PICK_PROJECT = 'Pick a project in the switcher to search all of it';

function crawlText(view: DeepSearchView): string {
  if (view.status === 'running') {
    return `Searched ${view.folders} folders, ${view.nodes} files and folders found`;
  }
  if (view.status === 'cancelled') return 'Search cancelled';
  if (view.status === 'warning') {
    return view.detail ?? `${view.failed} folders could not be read`;
  }
  return `Searched ${view.folders} folders`;
}

export function DocumentTree({
  selectedUrn,
  revealTrail,
  pickPreview = previewEmpty,
  onOpenModel,
  onOpenTabs,
  onOpenTogether,
  onExportIfc,
  ifcBatch,
  onOpenModal,
  addTarget,
  root = DEFAULT_TREE_ROOT,
  pollMs = VERSION_POLL_MS,
}: DocumentTreeProps) {
  const rootId = root.node.id;
  const rootScope = root.scope;
  const copy = rootCopy(rootScope);
  const [filter, setFilter] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const typeahead = useRef({
    text: '',
    timer: null as ReturnType<typeof setTimeout> | null,
  });
  const rowsRef = useRef<Row[]>([]);
  const virtualizerRef = useRef<Virtualizer<HTMLDivElement, Element> | null>(
    null,
  );

  const [view, setView] = usePersisted(PANE_SETTINGS.tree.view);
  const [preview, setPreview] = useState<{
    node: TreeNode;
    anchor: DOMRect;
    from: HTMLElement | null;
  } | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const viewEntries = (): MenuEntry[] => [
    {
      id: 'sort-name',
      label: 'Sort by name',
      checked: view.sort === 'name',
      onSelect: () => setView({ ...view, sort: 'name' }),
    },
    {
      id: 'sort-modified',
      label: 'Sort by modified',
      checked: view.sort === 'modified',
      onSelect: () => setView({ ...view, sort: 'modified' }),
    },
    { kind: 'separator', id: 'sep' },
    ...(['modified', 'author', 'size'] as const).map((column) => ({
      id: `col-${column}`,
      label: `Show ${column}`,
      checked: view[column],
      onSelect: () => setView({ ...view, [column]: !view[column] }),
    })),
  ];

  const viewRef = useRef(view);
  viewRef.current = view;
  const {
    state,
    snapshot,
    search: crawl,
  } = useTreeState({
    root,
    sort: () => viewRef.current.sort,
  });
  const openLatest = useRef(onOpenModel);
  openLatest.current = onOpenModel;
  useEffect(
    () =>
      COMMANDS.register('tree', () =>
        treeCommands(state, (model) =>
          openLatest.current(model.urn, model.context),
        ),
      ),
    [state],
  );
  const { errors, picked, notice } = snapshot;
  const { contextFor, resolved, needsCheck, parentName } = state;

  const searchProject = () => {
    if (!state.crawled()) state.deepSearch.start();
  };

  const clearSearch = () => {
    setFilter('');
  };

  const selectedUrnRef = useRef(selectedUrn);
  selectedUrnRef.current = selectedUrn;

  const openNode = (node: TreeNode) =>
    state.open(node, (model) => onOpenModel(model.urn, model.context));

  const recentUrns = () => listRecentModels().map((entry) => entry.urn);

  const hasLastOpened = (node: TreeNode) =>
    listRecentModels().some((entry) => entry.trail?.at(-1) === node.id);

  const openItem = async (node: TreeNode, mode: ItemOpen) => {
    const versions = await state.versionsOf(node);
    const target =
      mode === 'last'
        ? (pickLastOpened(versions, recentUrns()) ?? pickLatest(versions))
        : pickLatest(versions);
    if (target) {
      openNode(target);
      return;
    }
    notify('This file has no versions to open', { tone: 'error' });
  };

  const activate = (item: ItemInstance<TreeNode>) => {
    const node = item.getItemData();
    if (ifcBatch?.active && node.kind === 'version') {
      if (!isBlocked(node)) togglePick(node);
      return;
    }
    if (
      node.kind === 'item' &&
      view.itemOpen !== 'expand' &&
      !ifcBatch?.active
    ) {
      void openItem(node, view.itemOpen);
      return;
    }
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

  const cancelPreviewTimer = () => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = null;
  };

  const openPreview = (node: TreeNode, element?: HTMLElement | null) => {
    cancelPreviewTimer();
    const from =
      element ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    const anchor = from?.getBoundingClientRect() ?? new DOMRect(0, 0, 0, 0);
    setPreview({ node, anchor, from });
  };

  const closePreview = (restoreFocus: boolean) => {
    if (restoreFocus) preview?.from?.focus();
    setPreview(null);
  };

  const hoverPreview = (node: TreeNode) => {
    if (!view.thumbnails || node.kind !== 'item') return {};
    return {
      onMouseEnter: (event: MouseEvent<HTMLDivElement>) => {
        cancelPreviewTimer();
        const element = event.currentTarget;
        previewTimer.current = setTimeout(() => {
          previewTimer.current = null;
          openPreview(node, element);
        }, PREVIEW_HOVER_MS);
      },
      onMouseLeave: cancelPreviewTimer,
    };
  };

  const pickedUrns = new Set(picked.map((model) => model.urn));

  const { isBlocked, togglePick } = state;

  const pickRange = (node: TreeNode) => {
    const listed = rowsRef.current.flatMap((row) => {
      const data =
        row.type === 'node'
          ? row.item.getItemData()
          : row.type === 'result'
            ? row.node
            : null;
      return data?.kind === 'version' ? [data] : [];
    });
    state.pickRange(node, listed);
  };

  const onPickClick = (event: MouseEvent, node: TreeNode): boolean => {
    if (node.kind !== 'version') return false;
    if (
      ifcBatch?.active &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey
    ) {
      event.preventDefault();
      if (!isBlocked(node)) togglePick(node);
      return true;
    }
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
    if (isBlocked(node)) {
      if (!ifcBatch?.active) openNode(node);
    } else togglePick(node);
    return true;
  };

  const addNode = (node: TreeNode) => {
    if (!addTarget) return;
    state.add(node, (models) => addTarget.onAdd(models));
  };

  const pinsApi = usePins();
  const rowMenu = useRowMenu();

  const focusItem = (id: string) => {
    const item = tree.getItemInstance(id);
    item.setFocused();
    tree.updateDomFocus();
  };

  const copyLink = async (urn: string, context: ModelContext) => {
    const href = modelHref(urn, context);
    if (await writeClipboard(href)) {
      notify('Link copied', { detail: href });
    } else {
      notify('Could not copy the link', { tone: 'error', detail: href });
    }
  };

  const revealPath = (node: TreeNode) => {
    void (async () => {
      if (searching) {
        clearSearch();
      }
      if (!(await state.revealTo(node))) return;
      await sleep(80);
      focusItem(node.id);
    })();
  };

  const showVersions = (node: TreeNode) => {
    const parentId = node.parentId;
    if (!parentId) return;
    void (async () => {
      if (searching) {
        clearSearch();
      }
      if (!(await state.revealTo(node))) return;
      const parent = tree.getItemInstance(parentId);
      if (parent.isFolder() && !parent.isExpanded()) parent.expand();
      await sleep(80);
      focusItem(parentId);
    })();
  };

  const showItemVersions = (node: TreeNode) => {
    void (async () => {
      if (searching) {
        clearSearch();
      }
      if (!(await state.revealTo(node))) return;
      const item = tree.getItemInstance(node.id);
      if (item.isFolder() && !item.isExpanded()) item.expand();
      await sleep(80);
      focusItem(node.id);
    })();
  };

  const dragProps = (node: TreeNode) => {
    const urn = openableUrn(node);
    if (!urn || needsCheck(node)) return {};
    return {
      draggable: true,
      onDragStart: (event: DragEvent<HTMLDivElement>) =>
        startModelDrag(event, { urn, context: contextFor(node) }),
    };
  };

  const menuProps = (node: TreeNode) => {
    if (node.kind === 'item') {
      return rowMenu.bind(() =>
        itemMenuEntries({
          hasLastOpened: hasLastOpened(node),
          onOpenLatest: () => void openItem(node, 'latest'),
          onOpenLastOpened: () => void openItem(node, 'last'),
          onShowVersions: () => showItemVersions(node),
          onPreview: () => openPreview(node),
        }),
      );
    }
    if (node.kind !== 'version') return undefined;
    return rowMenu.bind(() => {
      const urn = openableUrn(node);
      const context = contextFor(node);
      return modelMenuEntries({
        urn,
        context,
        addTarget,
        pinned: pinsApi.pins.some((pin) => pin.urn === urn),
        onOpen: () => openNode(node),
        onOpenTab:
          onOpenTabs && urn ? () => onOpenTabs([{ urn, context }]) : undefined,
        onOpenModal:
          onOpenModal && urn ? () => onOpenModal(urn, context) : undefined,
        onAdd: () => addNode(node),
        onTogglePin: () => {
          if (urn) pinsApi.toggle(urn, context);
        },
        onCopyLink: urn ? () => void copyLink(urn, context) : undefined,
        onRevealPath: () => revealPath(node),
        onShowVersions: () => showVersions(node),
      });
    });
  };

  const rowAction = (node: TreeNode) => {
    const urn = openableUrn(node);
    if (!urn || !addTarget) return null;
    const name = contextFor(node).file ?? node.name;
    if (addTarget.has(urn)) {
      const label = `Remove ${name} from the open viewer`;
      return (
        <button
          type="button"
          className="tree-row__action tree-row__action--remove"
          tabIndex={-1}
          aria-label={label}
          title="Remove from the open viewer"
          onClick={(event) => {
            event.stopPropagation();
            addTarget.onRemove(urn);
          }}
        >
          <Icon name="close" size={13} />
        </button>
      );
    }
    if (!addTarget.canAdd(urn)) return null;
    const label = `Add ${name} to ${addTarget.label}`;
    return (
      <button
        type="button"
        className="tree-row__action"
        tabIndex={-1}
        aria-label={label}
        title={`${label}. With the keyboard, press Space to select the version, then use Add to ${addTarget.label} in the selection bar.`}
        onClick={(event) => {
          event.stopPropagation();
          addNode(node);
        }}
      >
        <Icon name="plus" size={13} />
      </button>
    );
  };

  const tree = useTree<TreeNode>({
    rootItemId: rootId,
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
      getItem: (id) => state.node(id) ?? LOADING_NODE,
      getChildrenWithData: async (id) =>
        (await state.children(id)).map((node) => ({ id: node.id, data: node })),
    },
    features: [asyncDataLoaderFeature, selectionFeature, hotkeysCoreFeature],
  });

  state.bind({
    folders: () =>
      tree
        .getItems()
        .filter((item) => item.isFolder())
        .map((item) => ({ id: item.getId(), expanded: item.isExpanded() })),
    isExpanded: (id) => tree.getItemInstance(id).isExpanded(),
    expand: (id) => {
      const item = tree.getItemInstance(id);
      if (!item.isExpanded()) item.expand();
    },
    invalidate: (id, keepChildren) =>
      void tree.getItemInstance(id).invalidateChildrenIds(keepChildren),
  });

  const seenSort = useRef(view.sort);
  useEffect(() => {
    if (seenSort.current === view.sort) return;
    seenSort.current = view.sort;
    state.resort();
  }, [view.sort, state]);

  const revealKey = revealTrail?.join(TRAIL_SEPARATOR) ?? '';
  useEffect(() => {
    if (!revealKey) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        if (
          !(await state.revealIds(
            revealKey.split(TRAIL_SEPARATOR),
            () => cancelled,
          ))
        ) {
          return;
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
  }, [revealKey, state]);

  useEffect(
    () =>
      onDeepSearch(() => {
        searchRef.current?.focus();
      }),
    [],
  );

  useEffect(() => () => state.deepSearch.dispose(), [state]);

  const query = filter.trim().toLowerCase();
  const searching = query !== '';
  const crawlRootId = state.crawlRoot();

  const onTreeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) {
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'Escape' && ifcBatch?.active) {
      event.preventDefault();
      state.clearPicked();
      ifcBatch.stop();
      return;
    }
    if (event.key === 'Enter') {
      if (!target?.closest('[role="treeitem"]')) return;
      if (target.closest('button, a')) return;
      const item = tree
        .getItems()
        .find((entry) => entry.getElement() === target);
      if (!item) return;
      event.preventDefault();
      activate(item);
      return;
    }
    if (event.key === '/') {
      event.preventDefault();
      searchRef.current?.focus();
      return;
    }
    if (query || event.key.length !== 1 || event.key === ' ') return;
    if (!target?.closest('[role="treeitem"], [role="option"]')) return;
    const items = tree.getItems();
    if (items.length === 0) return;
    const typed = typeahead.current;
    typed.text += event.key.toLowerCase();
    if (typed.timer) clearTimeout(typed.timer);
    typed.timer = setTimeout(() => {
      typed.text = '';
      typed.timer = null;
    }, TYPEAHEAD_MS);
    const focused = tree.getState().focusedItem;
    const element = document.activeElement;
    const onElement = items.findIndex(
      (item) => element !== null && item.getElement() === element,
    );
    const current =
      onElement >= 0
        ? onElement
        : items.findIndex((item) => item.getId() === focused);
    const start = typed.text.length === 1 ? current + 1 : Math.max(current, 0);
    for (let offset = 0; offset < items.length; offset += 1) {
      const item = items[(start + offset) % items.length];
      if (!item) continue;
      if (item.getItemName().toLowerCase().startsWith(typed.text)) {
        event.preventDefault();
        item.setFocused();
        tree.updateDomFocus();
        return;
      }
    }
  };

  useEffect(
    () => () => {
      if (typeahead.current.timer) clearTimeout(typeahead.current.timer);
      if (previewTimer.current) clearTimeout(previewTimer.current);
    },
    [],
  );

  const rows: Row[] = [];
  if (searching) {
    const found = state.search(query);
    for (const node of found) {
      rows.push({ type: 'result', key: `result:${node.id}`, node });
    }
    if (rows.length === 0) {
      rows.push({
        type: 'status',
        key: 'status:search',
        variant: 'empty',
        level: 0,
        parentId: rootId,
        title: 'Nothing found',
        message: `No matches for “${filter.trim()}” in loaded folders.`,
        clearFilter: true,
      });
    }
  } else {
    const rootItem = tree.getItemInstance(rootId);
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
        } else if (state.isLoaded(id) && childCount === 0) {
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
      if (errors[rootId]) {
        rows.push({
          type: 'status',
          key: 'status:root',
          variant: 'error',
          level: 0,
          parentId: rootId,
          title: copy.error,
          message: errors[rootId]?.message,
          detail: errors[rootId]?.detail,
        });
      } else if (state.isLoaded(rootId)) {
        rows.push({
          type: 'status',
          key: 'status:root',
          variant: 'empty',
          level: 0,
          parentId: rootId,
          title: copy.empty,
          message: copy.emptyMessage,
          noHubs: rootScope.kind === 'root',
        });
      } else if (rootItem.isLoading() || !state.isLoaded(rootId)) {
        rows.push({
          type: 'status',
          key: 'status:root',
          variant: 'loading',
          level: 0,
          parentId: rootId,
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
        return rowHeightFor(node.kind, node.name, undefined, view.rows);
      }
      if (row?.type === 'result') {
        return rowHeightFor(
          row.node.kind,
          row.node.name,
          parentName(row.node),
          view.rows,
        );
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

  const { retry, refresh, refreshAll } = state;

  useEffect(() => {
    state.refreshStale();
  });

  const pendingKey = state.pendingKey();
  const expandedKey = (tree.getState().expandedItems ?? []).join(
    TRAIL_SEPARATOR,
  );

  useEffect(() => {
    state.forgetCollapsed(expandedKey.split(TRAIL_SEPARATOR));
  }, [expandedKey, state]);

  useEffect(() => state.poll(pendingKey, pollMs), [pendingKey, pollMs, state]);

  const filterDisabled = !searching && !rows.some((row) => row.type === 'node');

  const savePickedAsSet = () => {
    const refs = new Map<string, ItemRef | null>();
    for (const item of tree.getItems()) {
      const node = resolved(item.getItemData());
      const urn = openableUrn(node);
      if (urn) refs.set(urn, state.itemRef(node));
    }
    saveModelSetPrompt(
      picked.map((model) => ({
        urn: model.urn,
        context: model.context,
        ref: refs.get(model.urn) ?? null,
      })),
    );
  };

  const containerProps: Record<string, unknown> = searching
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
          latest={node.latest}
          thumbnail={
            view.thumbnails &&
            view.rows === 'thumbnails' &&
            node.kind === 'item' &&
            node.tipUrn
              ? thumbnailPath(node.tipUrn, 100)
              : undefined
          }
          meta={metaText(node, view)}
          picked={urn !== null && pickedUrns.has(urn)}
          checkbox={ifcBatch?.active && node.kind === 'version'}
          action={rowAction(node)}
          added={urn !== null && addTarget?.has(urn)}
          rowProps={{
            ...props,
            ...menuProps(node),
            ...dragProps(node),
            ...hoverPreview(node),
            'data-index': index,
            'aria-checked':
              urn !== null && onOpenTogether ? pickedUrns.has(urn) : undefined,
            onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
              menuProps(node)?.onKeyDown?.(event);
              if (event.defaultPrevented) return;
              if (event.key === ' ' && node.kind === 'item') {
                event.preventDefault();
                event.stopPropagation();
                openPreview(node, event.currentTarget);
                return;
              }
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
          latest={resultNode.latest}
          caption={resultNode.kind === 'version' ? undefined : resultNode.kind}
          secondary={parentName(resultNode)}
          highlight={query}
          selected={urn !== null && urn === selectedUrn}
          picked={urn !== null && pickedUrns.has(urn)}
          checkbox={ifcBatch?.active && resultNode.kind === 'version'}
          action={rowAction(resultNode)}
          added={urn !== null && addTarget?.has(urn)}
          rowProps={{
            ...menuProps(resultNode),
            ...dragProps(resultNode),
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
              menuProps(resultNode)?.onKeyDown?.(event);
              if (event.defaultPrevented) return;
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
          minHeight: 'var(--tree-row-height)',
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
            rows={row.parentId === rootId ? 4 : 2}
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
                ? {
                    label: 'Show all',
                    onClick: clearSearch,
                  }
                : { label: 'Refresh', onClick: () => refresh(row.parentId) }
            }
          />
        )}
      </div>
    );
  };

  return (
    <div
      className="doc-tree"
      data-ifc-batch={ifcBatch?.active || undefined}
      onKeyDownCapture={onTreeKeyDown}
    >
      <PersonalHubNotice onCheckAgain={() => refresh(rootId)} />
      <div className="doc-tree__search">
        <Icon name="search" size={14} />
        <Input
          ref={searchRef}
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              view.searchScope === 'project' &&
              crawlRootId
            ) {
              event.preventDefault();
              searchProject();
            }
            if (event.key === 'Escape' && (filter || searching)) {
              event.stopPropagation();
              clearSearch();
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
        <Menu
          label="Documents view"
          title="Sort and columns"
          trigger={<Icon name="filter" size={14} />}
          triggerClassName="doc-tree__view"
          items={viewEntries}
        />
        <button
          type="button"
          className="doc-tree__refresh"
          aria-label="Refresh documents"
          title="Refresh documents"
          onClick={refreshAll}
        >
          <Icon name="refresh" size={14} />
        </button>
      </div>
      {searching || crawl?.status === 'running' ? (
        <div className="doc-tree__crawl" role="status" aria-live="polite">
          {crawl ? (
            <span className="doc-tree__crawl-text">{crawlText(crawl)}</span>
          ) : (
            <span className="doc-tree__crawl-text" />
          )}
          {crawl?.status === 'running' ? (
            <Button
              className="doc-tree__crawl-action"
              onClick={state.deepSearch.cancel}
            >
              Cancel
            </Button>
          ) : (
            <Button
              className="doc-tree__crawl-action"
              disabled={!crawlRootId}
              title={
                crawlRootId ? 'Read every folder in this project' : PICK_PROJECT
              }
              onClick={state.deepSearch.start}
            >
              Search whole project
            </Button>
          )}
          {!crawlRootId ? (
            <span className="doc-tree__crawl-hint">{PICK_PROJECT}</span>
          ) : null}
        </div>
      ) : null}
      {ifcBatch?.active && onExportIfc ? (
        <IfcBatchBubble
          picked={picked}
          onExport={(models) => {
            if (onExportIfc(models) === false) return;
            state.clearPicked();
            ifcBatch.stop();
          }}
          onCancel={() => {
            state.clearPicked();
            ifcBatch.stop();
          }}
        />
      ) : onOpenTogether ? (
        <PickBar
          picked={picked}
          pickPreview={pickPreview}
          addTarget={addTarget ?? null}
          onOpenTabs={
            onOpenTabs
              ? (models) => {
                  onOpenTabs(models);
                  state.clearPicked();
                }
              : undefined
          }
          onOpenTogether={(models) => {
            onOpenTogether(models);
            state.clearPicked();
          }}
          onSaveSet={savePickedAsSet}
          onExportIfc={
            onExportIfc
              ? (models) => {
                  if (onExportIfc(models) === false) return;
                  state.clearPicked();
                  ifcBatch?.stop();
                }
              : undefined
          }
          onClear={state.clearPicked}
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
                    onClick: () => state.checkAgain(notice.itemId as string),
                  }
                : { label: 'Dismiss', onClick: state.dismissNotice }
            }
          >
            {notice.itemId ? (
              <Button size="small" onClick={state.dismissNotice}>
                Dismiss
              </Button>
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
      {rowMenu.menu}
      {preview ? (
        <PreviewCard
          key={preview.node.id}
          node={preview.node}
          anchor={preview.anchor}
          showImage={view.thumbnails}
          onClose={closePreview}
        />
      ) : null}
    </div>
  );
}
