import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { TreeNode, VersionViewState } from '../../shared/types.js';
import { viewableFor } from '../../shared/viewState.js';
import { fetchVersionViewState } from '../api/client.js';
import { childrenQueryOptions } from '../api/hooks.js';
import { versionTag } from '../api/modelContext.js';
import { StateBlock } from '../components/StateBlock.js';
import { usePins } from '../components/tree/pins.js';
import type { ModelOpeners } from '../components/tree/useModelOpeners.js';
import {
  VIEW_STATE_COPY,
  viewStateOf,
} from '../components/tree/viewStateCopy.js';
import type { LayoutApi } from '../layout/layoutContext.js';
import { usePersisted } from '../storage.js';
import { notify } from '../tasks/notifications.js';
import {
  VERSION_HISTORY_VIEW,
  VERSION_TARGET,
  type VersionTarget,
  versionContext,
  visibleVersions,
} from './versionHistory.js';
import './panels.css';

export interface VersionHistoryPanelProps {
  openers: Pick<ModelOpeners, 'open' | 'openTabs' | 'openTogether'>;
}

export function openVersionHistory(
  layout: LayoutApi,
  target: VersionTarget,
): void {
  VERSION_TARGET.write(target);
  if (layout.isOpen('versions')) layout.focusPane('versions');
  else layout.togglePane('versions');
}

function labelOf(version: TreeNode): string {
  return versionTag(version.name) ?? version.name;
}

export function VersionHistoryPanel({ openers }: VersionHistoryPanelProps) {
  const [target] = usePersisted(VERSION_TARGET);
  const [view, setView] = usePersisted(VERSION_HISTORY_VIEW);
  const [checked, setChecked] = useState<Record<string, VersionViewState>>({});
  const [picked, setPicked] = useState<readonly string[]>([]);
  const pinsApi = usePins();
  const itemId = target?.itemId ?? '';
  const query = useQuery({
    ...childrenQueryOptions({
      kind: 'item',
      id: itemId,
      projectId: target?.projectId ?? '',
    }),
    enabled: Boolean(target),
  });

  useEffect(() => {
    setPicked([]);
    setChecked({});
  }, [itemId]);

  if (!target) {
    return (
      <section className="bsh-card bsh-versions" aria-label="Version history">
        <header className="bsh-card__header">
          <h2 className="bsh-card__title">Version history</h2>
        </header>
        <StateBlock
          variant="empty"
          title="No file chosen"
          message="Pick a file in Documents, then choose Version history."
        />
      </section>
    );
  }

  const versions = (query.data ?? []).map((version) => {
    const state = checked[version.id];
    return state ? { ...version, ...state, checked: true } : version;
  });
  const rows = visibleVersions(versions, view);
  const openable = (version: TreeNode) =>
    Boolean(version.urn) && viewableFor(viewStateOf(version));
  const pickedRows = rows.filter(
    (version) => picked.includes(version.id) && openable(version),
  );
  const compareReady = pickedRows.length === 2;
  const compareReason = compareReady
    ? undefined
    : 'Pick two versions that can open to compare them.';

  const togglePick = (id: string) => {
    setPicked((current) => {
      if (current.includes(id)) return current.filter((entry) => entry !== id);
      if (current.length >= 2) return current;
      return [...current, id];
    });
  };

  const ensureChecked = async (version: TreeNode): Promise<TreeNode | null> => {
    if (version.checked !== false) return version;
    try {
      const state = await fetchVersionViewState(
        target.projectId,
        target.itemId,
        version.id,
      );
      setChecked((current) => ({ ...current, [version.id]: state }));
      return { ...version, ...state, checked: true };
    } catch {
      notify('Could not check whether this version opens', { tone: 'error' });
      return null;
    }
  };

  const openRow = async (version: TreeNode) => {
    const ready = await ensureChecked(version);
    if (!ready?.urn) return;
    openers.open(ready.urn, versionContext(target, ready));
  };

  const openInTab = async (version: TreeNode) => {
    const ready = await ensureChecked(version);
    if (!ready?.urn) return;
    openers.openTabs([
      { urn: ready.urn, context: versionContext(target, ready) },
    ]);
  };

  const pickedModels = () =>
    pickedRows.map((version) => ({
      urn: version.urn as string,
      context: versionContext(target, version),
    }));

  return (
    <section className="bsh-card bsh-versions" aria-label="Version history">
      <header className="bsh-card__header">
        <h2 className="bsh-card__title">Version history</h2>
        <span className="bsh-muted">{target.file}</span>
      </header>
      <div className="bsh-versions__tools">
        <input
          type="search"
          className="bsh-input"
          aria-label="Filter versions"
          placeholder="Filter by version or author"
          value={view.filter}
          onChange={(event) =>
            setView((current) => ({ ...current, filter: event.target.value }))
          }
        />
        <label className="bsh-field">
          <input
            type="checkbox"
            checked={view.viewableOnly}
            onChange={(event) =>
              setView((current) => ({
                ...current,
                viewableOnly: event.target.checked,
              }))
            }
          />
          Viewable only
        </label>
      </div>
      {query.status === 'pending' ? (
        <StateBlock variant="loading" message="Loading versions" rows={3} />
      ) : null}
      {query.status === 'error' ? (
        <StateBlock
          variant="error"
          message="We could not load the versions of this file."
          detail={
            query.error instanceof Error ? query.error.message : undefined
          }
          action={{ label: 'Retry', onClick: () => void query.refetch() }}
        />
      ) : null}
      {query.status === 'success' && rows.length === 0 ? (
        <StateBlock
          variant="empty"
          title="No versions match"
          message="Change the filter or show every version."
        />
      ) : null}
      {rows.length > 0 ? (
        <div className="bsh-table-wrap">
          <table
            className="bsh-table bsh-table--versions"
            aria-label={`Versions of ${target.file}`}
          >
            <thead>
              <tr>
                <th scope="col">Pick</th>
                <th scope="col">Version</th>
                <th scope="col">Date</th>
                <th scope="col">Author</th>
                <th scope="col">State</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((version) => {
                const label = labelOf(version);
                const isPicked = picked.includes(version.id);
                const pinned = pinsApi.pins.some(
                  (pin) => pin.urn === version.urn,
                );
                return (
                  <tr key={version.id} data-latest={version.latest}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Pick ${label}`}
                        checked={isPicked}
                        disabled={!isPicked && picked.length >= 2}
                        onChange={() => togglePick(version.id)}
                      />
                    </td>
                    <td>
                      <span className="bsh-versions__label">
                        {version.name}
                      </span>
                      {version.latest ? (
                        <span
                          className="bsh-badge bsh-versions__latest"
                          title="Latest version"
                        >
                          Latest
                        </span>
                      ) : null}
                    </td>
                    <td>{version.modifiedAt?.slice(0, 10) ?? ''}</td>
                    <td>{version.modifiedBy ?? ''}</td>
                    <td>
                      <span className="bsh-badge">
                        {VIEW_STATE_COPY[viewStateOf(version)].label}
                      </span>
                    </td>
                    <td>
                      <div className="bsh-versions__actions">
                        <button
                          type="button"
                          className="bsh-button"
                          aria-label={`Open ${label}`}
                          disabled={!version.urn}
                          onClick={() => void openRow(version)}
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          className="bsh-button"
                          aria-label={`Open ${label} in a new tab`}
                          disabled={!version.urn}
                          onClick={() => void openInTab(version)}
                        >
                          Open in new tab
                        </button>
                        <button
                          type="button"
                          className="bsh-button"
                          aria-label={`${pinned ? 'Unpin' : 'Pin'} ${label}`}
                          disabled={!version.urn}
                          onClick={() => {
                            if (version.urn) {
                              pinsApi.toggle(
                                version.urn,
                                versionContext(target, version),
                              );
                            }
                          }}
                        >
                          {pinned ? 'Unpin' : 'Pin'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {query.status === 'success' ? (
        <div className="bsh-versions__footer">
          <button
            type="button"
            className="bsh-button"
            title={compareReason}
            disabled={!compareReady}
            onClick={() => openers.openTabs(pickedModels())}
          >
            Compare as tabs
          </button>
          <button
            type="button"
            className="bsh-button"
            title={compareReason}
            disabled={!compareReady}
            onClick={() => openers.openTogether(pickedModels())}
          >
            Compare in one viewer
          </button>
        </div>
      ) : null}
    </section>
  );
}
