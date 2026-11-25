import type { DockviewApi, DockviewGroupPanel } from 'dockview-react';
import { activeKind, constrain } from './dockOps.js';
import {
  type SerializedDock,
  siblingCountOf,
  splitAxisOf,
} from './layoutState.js';
import { type PaneId, paneById, paneKind } from './paneRegistry.js';

export const GAP = 12;
export const HEADER_SIZE = 33;
const UNBOUNDED = Number.POSITIVE_INFINITY;

type Counter = { current: number };

function stripHeight(group: DockviewGroupPanel, siblings: number) {
  const probe = document.createElement('div');
  probe.style.height = 'var(--hit-target)';
  group.element.append(probe);
  const header = probe.getBoundingClientRect().height || HEADER_SIZE - 3;
  probe.remove();
  return header + 2 + (GAP * (siblings - 1)) / siblings;
}

function relax(group: DockviewGroupPanel) {
  const active = activeKind(group);
  if (!active) return;
  const min = paneById(active).minSize;
  constrain(group, {
    minimumWidth: min.width,
    maximumWidth: UNBOUNDED,
    minimumHeight: min.height,
    maximumHeight: UNBOUNDED,
  });
}

function pinOthers(api: DockviewApi, skip: Set<string>) {
  const json = api.toJSON() as unknown as SerializedDock;
  const pinned: DockviewGroupPanel[] = [];
  for (const group of api.groups) {
    if (skip.has(group.id) || group.element.dataset.collapsed) continue;
    if (group.api.location.type !== 'grid') continue;
    if (group.panels.some((panel) => paneKind(panel.id) === 'viewer')) {
      continue;
    }
    const active = activeKind(group);
    const axis = splitAxisOf(json, group.id);
    if (!axis || !active) continue;
    const min = paneById(active).minSize;
    const siblings = siblingCountOf(json, group.id) ?? 1;
    const share = (GAP * (siblings - 1)) / siblings;
    const size = (axis === 'width' ? group.width : group.height) + share;
    if (axis === 'width') {
      constrain(group, {
        minimumWidth: size,
        maximumWidth: size,
        minimumHeight: min.height,
        maximumHeight: UNBOUNDED,
      });
    } else {
      constrain(group, {
        minimumWidth: min.width,
        maximumWidth: UNBOUNDED,
        minimumHeight: size,
        maximumHeight: size,
      });
    }
    pinned.push(group);
  }
  return () => {
    for (const group of pinned) {
      if (api.groups.includes(group) && !group.element.dataset.collapsed) {
        relax(group);
      }
    }
  };
}

export function steady(
  api: DockviewApi,
  busy: Counter,
  run: (api: DockviewApi) => void,
  skip: string[] = [],
) {
  busy.current += 1;
  const release = pinOthers(api, new Set(skip));
  try {
    run(api);
  } finally {
    release();
    busy.current -= 1;
  }
}

function restoredSize(
  saved: Map<string, number>,
  group: DockviewGroupPanel,
  pane: PaneId,
  axis: 'width' | 'height',
) {
  const previous = saved.get(group.id);
  saved.delete(group.id);
  const min = paneById(pane).minSize;
  const floor = axis === 'width' ? min.width : min.height;
  if (previous !== undefined && previous >= floor) return previous;
  const placement = paneById(pane).defaultPlacement;
  return placement.kind === 'root' || placement.kind === 'tab'
    ? floor
    : Math.max(placement.size, floor);
}

export function applyCollapse(
  api: DockviewApi,
  collapsed: readonly PaneId[],
  saved: Map<string, number>,
  busy: Counter,
) {
  const json = api.toJSON() as unknown as SerializedDock;
  const changes: {
    group: DockviewGroupPanel;
    pane: PaneId;
    axis: 'width' | 'height';
    collapse: boolean;
  }[] = [];
  for (const group of api.groups) {
    const active = activeKind(group);
    if (!active) continue;
    const axis =
      group.api.location.type === 'grid' ? splitAxisOf(json, group.id) : null;
    const want = axis !== null && collapsed.includes(active);
    const current = group.element.dataset.collapsed as
      | 'width'
      | 'height'
      | undefined;
    if (want && axis && current !== axis) {
      changes.push({ group, pane: active, axis, collapse: true });
    } else if (!want && current) {
      changes.push({ group, pane: active, axis: current, collapse: false });
    }
  }
  busy.current += 1;
  try {
    for (const group of api.groups) {
      if (!group.element.dataset.collapsed) relax(group);
    }
    if (changes.length === 0) return;
    steady(
      api,
      busy,
      () => {
        for (const { group, pane, axis, collapse } of changes) {
          const min = paneById(pane).minSize;
          if (collapse) {
            if (!group.element.dataset.collapsed) {
              saved.set(
                group.id,
                axis === 'width' ? group.width : group.height,
              );
            }
            group.element.dataset.collapsed = axis;
            const strip = stripHeight(
              group,
              siblingCountOf(json, group.id) ?? 1,
            );
            constrain(
              group,
              axis === 'height'
                ? {
                    minimumHeight: strip,
                    maximumHeight: strip,
                    minimumWidth: min.width,
                    maximumWidth: UNBOUNDED,
                  }
                : {
                    minimumWidth: HEADER_SIZE,
                    maximumWidth: HEADER_SIZE,
                    minimumHeight: min.height,
                    maximumHeight: UNBOUNDED,
                  },
            );
            group.api.setSize(
              axis === 'height' ? { height: strip } : { width: HEADER_SIZE },
            );
          } else {
            delete group.element.dataset.collapsed;
            relax(group);
            const siblings = siblingCountOf(json, group.id) ?? 1;
            const size =
              restoredSize(saved, group, pane, axis) +
              (GAP * (siblings - 1)) / siblings;
            group.api.setSize(
              axis === 'width' ? { width: size } : { height: size },
            );
          }
        }
      },
      changes.map((change) => change.group.id),
    );
  } finally {
    busy.current -= 1;
  }
}
