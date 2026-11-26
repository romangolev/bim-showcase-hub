import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { APP_NOT_PROVISIONED } from '../../../shared/types.js';
import { ApiError } from '../../api/client.js';
import { childrenQueryOptions } from '../../api/hooks.js';
import { ROOT_SCOPE } from '../../api/scope.js';
import { usePersisted } from '../../storage.js';
import { Icon } from '../icons.js';
import { Menu, type MenuEntry } from '../Menu.js';
import {
  ALL_HUBS,
  DOC_ROOT,
  type DocRoot,
  effectiveDocRoot,
  hubScope,
  type TreeRoot,
  treeRootOf,
} from './docRoot.js';

interface HubProjectSwitcherProps {
  onChange: (root: TreeRoot) => void;
}

export function HubProjectSwitcher({ onChange }: HubProjectSwitcherProps) {
  const [stored, setStored] = usePersisted(DOC_ROOT);
  const hubs = useQuery(childrenQueryOptions(ROOT_SCOPE));
  const unprovisioned =
    hubs.error instanceof ApiError && hubs.error.code === APP_NOT_PROVISIONED;
  const [provisioningBlocked, setProvisioningBlocked] = useState(false);
  useEffect(() => {
    if (unprovisioned) setProvisioningBlocked(true);
    else if (hubs.data !== undefined) setProvisioningBlocked(false);
  }, [unprovisioned, hubs.data]);
  const storedRoot = provisioningBlocked || unprovisioned ? ALL_HUBS : stored;
  const projects = useQuery({
    ...childrenQueryOptions(hubScope(storedRoot.hubId || 'none')),
    enabled: storedRoot.hubId !== '',
  });
  const root = effectiveDocRoot(storedRoot, hubs.data, projects.data);
  const treeRoot = treeRootOf(root, hubs.data, projects.data);
  const key = `${treeRoot.scope.kind}:${treeRoot.node.id}`;
  const latest = useRef(treeRoot);
  latest.current = treeRoot;
  const seen = useRef<string | null>(null);

  useEffect(() => {
    if (seen.current === key) return;
    seen.current = key;
    onChange(latest.current);
  }, [key, onChange]);

  const choose = (next: DocRoot) => setStored(next);

  const hubLabel = root.hubId
    ? (hubs.data?.find((hub) => hub.id === root.hubId)?.name ?? 'Hub')
    : 'All hubs';
  const projectLabel = root.projectId
    ? (projects.data?.find((project) => project.id === root.projectId)?.name ??
      'Project')
    : 'All projects';

  const hubEntries = (): MenuEntry[] => [
    {
      id: 'all-hubs',
      label: 'All hubs',
      checked: root.hubId === '',
      onSelect: () => choose(ALL_HUBS),
    },
    ...(hubs.data ?? []).map((hub) => ({
      id: hub.id,
      label: hub.name,
      checked: root.hubId === hub.id,
      onSelect: () => choose({ hubId: hub.id, projectId: null }),
    })),
  ];

  const projectEntries = (): MenuEntry[] => {
    const entries: MenuEntry[] = [
      {
        id: 'all-projects',
        label: 'All projects',
        checked: root.projectId === null,
        onSelect: () => choose({ hubId: root.hubId, projectId: null }),
      },
    ];
    if (projects.isPending) {
      entries.push({
        kind: 'separator',
        id: 'projects-loading',
      });
      entries.push({
        id: 'loading',
        label: 'Loading projects…',
        disabled: true,
        onSelect: () => undefined,
      });
      return entries;
    }
    if (projects.isError) {
      entries.push({
        id: 'projects-error',
        label: 'Could not load projects',
        disabled: true,
        onSelect: () => undefined,
      });
      return entries;
    }
    for (const project of projects.data ?? []) {
      entries.push({
        id: project.id,
        label: project.name,
        checked: root.projectId === project.id,
        onSelect: () => choose({ hubId: root.hubId, projectId: project.id }),
      });
    }
    return entries;
  };

  return (
    <div className="docs-root">
      <Menu
        label="Documents hub"
        title="Root the tree at a hub"
        triggerClassName="docs-root__trigger"
        trigger={
          <>
            <Icon name="hub" size={13} />
            <span className="docs-root__value">{hubLabel}</span>
            <Icon name="chevron" size={11} />
          </>
        }
        items={hubEntries}
      />
      {root.hubId ? (
        <Menu
          label="Documents project"
          title="Root the tree at a project"
          triggerClassName="docs-root__trigger"
          trigger={
            <>
              <Icon name="project" size={13} />
              <span className="docs-root__value">{projectLabel}</span>
              <Icon name="chevron" size={11} />
            </>
          }
          items={projectEntries}
        />
      ) : null}
    </div>
  );
}
