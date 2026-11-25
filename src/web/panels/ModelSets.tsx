import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { MAX_COMBINED_MODELS } from '../../shared/combined.js';
import { fetchChildren } from '../api/client.js';
import { childrenQueryOptions } from '../api/hooks.js';
import { type ModelContext, versionTag } from '../api/modelContext.js';
import { Icon } from '../components/icons.js';
import { Menu, type MenuEntry } from '../components/Menu.js';
import type { ModelOpeners } from '../components/tree/useModelOpeners.js';
import { pickLatest } from '../components/tree/versionPick.js';
import { writeClipboard } from '../extensions/clipboard.js';
import {
  MAX_SET_MEMBERS,
  MODEL_SETS,
  type ModelSetData,
  type ModelSetMember,
  useModelSets,
} from '../store/modelSets.js';
import {
  type ResolvedSet,
  resolveModelSet,
  setLink,
} from '../store/openModelSet.js';
import { MAX_NAME_LENGTH } from '../store/savedStore.js';
import { notify } from '../tasks/notifications.js';
import { startTask } from '../tasks/taskStore.js';
import { Button } from '../ui/Button.js';
import { IconButton } from '../ui/IconButton.js';
import { openableUrn } from '../viewer/openLimits.js';
import type { VersionTarget } from './versionHistory.js';

export interface ModelSetDraft {
  urn: string;
  context: ModelContext;
  ref?: VersionTarget | null;
}

export interface ModelSetItem {
  id: string;
  name: string;
  version: number;
  updatedAt: number;
  data: ModelSetData;
}

const readVersions = (projectId: string, itemId: string) =>
  fetchChildren({ kind: 'item', id: itemId, projectId });

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function staleText(count: number): string {
  return `${plural(count, 'file')} ${count === 1 ? 'has' : 'have'} a newer version`;
}

function memberOf(draft: ModelSetDraft): ModelSetMember {
  const member: ModelSetMember = { urn: draft.urn, follow: 'pinned' };
  const { file, v, trail, crumbs } = draft.context;
  if (file) member.file = file;
  if (v) member.v = v;
  if (trail && trail.length > 0) member.trail = [...trail];
  if (crumbs && crumbs.length > 0) member.crumbs = [...crumbs];
  if (draft.ref) {
    member.projectId = draft.ref.projectId;
    member.itemId = draft.ref.itemId;
  }
  return member;
}

function membersFor(drafts: readonly ModelSetDraft[]): ModelSetMember[] {
  return drafts.slice(0, MAX_SET_MEMBERS).map(memberOf);
}

function SaveSetDialog({
  drafts,
  onDone,
}: {
  drafts: readonly ModelSetDraft[];
  onDone: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [name, setName] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const saved = MODEL_SETS.save(trimmed, { members: membersFor(drafts) });
    notify(
      saved
        ? `Saved the model set "${trimmed}"`
        : 'Could not save the model set. Delete some saved items and try again.',
      { tone: saved ? 'success' : 'error' },
    );
    onDone();
  };

  return (
    <dialog
      ref={dialogRef}
      className="modal modal--sm"
      aria-labelledby={titleId}
      onClose={onDone}
    >
      <div className="modal__panel">
        <header className="modal__head">
          <h2 id={titleId} className="modal__title">
            Save model set
          </h2>
          <IconButton label="Close" onClick={onDone}>
            <Icon name="close" size={16} />
          </IconButton>
        </header>
        <div className="modal__body">
          <label className="bsh-field">
            <span>Model set name</span>
            <input
              type="text"
              className="field"
              aria-label="Model set name"
              placeholder="Name this model set"
              maxLength={MAX_NAME_LENGTH}
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') save();
              }}
            />
          </label>
          <p className="settings__hint">
            {plural(Math.min(drafts.length, MAX_SET_MEMBERS), 'model')} in the
            set
          </p>
          <div className="bsh-presets">
            <Button onClick={onDone}>Cancel</Button>
            <Button disabled={!name.trim()} onClick={save}>
              Save model set
            </Button>
          </div>
        </div>
      </div>
    </dialog>
  );
}

export function saveModelSetPrompt(models: readonly ModelSetDraft[]): void {
  if (models.length === 0) return;
  const drafts = models.map((model) => ({ ...model }));
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let closed = false;
  const done = () => {
    if (closed) return;
    closed = true;
    root.unmount();
    host.remove();
  };
  flushSync(() => root.render(<SaveSetDialog drafts={drafts} onDone={done} />));
}

function RenameField({
  set,
  onDone,
}: {
  set: ModelSetItem;
  onDone: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  return (
    <input
      ref={inputRef}
      type="text"
      className="field"
      aria-label={`Rename ${set.name}`}
      maxLength={MAX_NAME_LENGTH}
      defaultValue={set.name}
      onBlur={(event) => {
        if (!MODEL_SETS.rename(set.id, event.target.value)) {
          notify('Could not rename the model set. Use a non-empty name.', {
            tone: 'error',
          });
        }
        onDone();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') onDone();
      }}
    />
  );
}

export function ModelSets({ openers }: { openers: ModelOpeners }) {
  const sets = useModelSets();
  const [editing, setEditing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [resolved, setResolved] = useState<Record<string, ResolvedSet>>({});

  const client = useQueryClient();
  const lookups = useRef(
    new Map<string, { key: string; set: Promise<ResolvedSet | null> }>(),
  );

  useEffect(() => {
    let cancelled = false;
    const known = lookups.current;
    const live = new Set(sets.map((set) => set.id));
    for (const id of known.keys()) if (!live.has(id)) known.delete(id);
    if (sets.length === 0) {
      setResolved({});
      return;
    }
    const cachedVersions = (projectId: string, itemId: string) =>
      client.fetchQuery(
        childrenQueryOptions({ kind: 'item', id: itemId, projectId }),
      );
    void Promise.all(
      sets.map(async (set) => {
        const key = `${set.version}:${set.updatedAt}`;
        let entry = known.get(set.id);
        if (entry?.key !== key) {
          entry = {
            key,
            set: resolveModelSet(set.data, cachedVersions).catch(() => null),
          };
          known.set(set.id, entry);
        }
        const out = await entry.set;
        return out ? ([set.id, out] as const) : null;
      }),
    ).then((entries) => {
      if (cancelled) return;
      const next: Record<string, ResolvedSet> = {};
      for (const entry of entries) {
        if (entry) next[entry[0]] = entry[1];
      }
      setResolved(next);
    });
    return () => {
      cancelled = true;
    };
  }, [sets, client]);

  const resolvedOf = async (set: ModelSetItem): Promise<ResolvedSet> =>
    resolved[set.id] ?? resolveModelSet(set.data, readVersions);

  const openSet = async (set: ModelSetItem, together: boolean) => {
    const task = startTask({ label: 'Opening model set' });
    try {
      const out = await resolveModelSet(set.data, readVersions);
      if (out.models.length === 0) {
        task.fail('This model set has no models to open');
        return;
      }
      const preview = openers.preview(
        out.models,
        together ? 'together' : 'tabs',
        { partial: true },
      );
      if (preview.blocked) {
        task.fail(preview.notice ?? 'Could not open this model set');
        return;
      }
      if (out.failed.length > 0) {
        task.warn(
          `Could not read the latest version of ${out.failed.join(', ')}. Opened the pinned versions.`,
        );
      } else {
        task.finish(`${plural(preview.admitted, 'model')} opened`);
      }
      if (out.stale.length > 0) {
        notify(
          `${staleText(out.stale.length)}. Choose Update to latest to pin ${
            out.stale.length === 1 ? 'it' : 'them'
          }.`,
        );
      }
      const options = { partial: true };
      if (together) openers.openTogether(out.models, options);
      else openers.openTabs(out.models, options);
    } catch (error) {
      task.fail(error);
    }
  };

  const copyLink = async (set: ModelSetItem) => {
    const out = await resolvedOf(set);
    const href = setLink(out.models);
    if (!href) {
      notify('Could not build a link for this model set.', { tone: 'error' });
      return;
    }
    if (await writeClipboard(href)) {
      notify('Link copied', { detail: href });
    } else {
      notify('Could not copy the link', { tone: 'error', detail: href });
    }
  };

  const updateToLatest = async (set: ModelSetItem) => {
    const members = await Promise.all(
      set.data.members.map(async (member) => {
        if (!member.projectId || !member.itemId) return member;
        try {
          const versions = await readVersions(member.projectId, member.itemId);
          const latest = pickLatest(
            versions.filter((node) => openableUrn(node) !== null),
          );
          if (!latest?.urn) return member;
          const next: ModelSetMember = { ...member, urn: latest.urn };
          const tag = versionTag(latest.name);
          if (tag) next.v = tag;
          else delete next.v;
          return next;
        } catch {
          return member;
        }
      }),
    );
    const saved = MODEL_SETS.save(set.name, { ...set.data, members }, set.id);
    notify(
      saved
        ? `Updated "${set.name}" to the latest versions`
        : 'Could not update the model set.',
      { tone: saved ? 'success' : 'error' },
    );
  };

  const entries = (set: ModelSetItem, index: number): MenuEntry[] => {
    const count = set.data.members.length;
    const together = openers.preview(
      set.data.members.map((member) => ({ urn: member.urn, context: {} })),
      'together',
    );
    const tooManyCombined = count > MAX_COMBINED_MODELS;
    return [
      {
        id: 'open-tabs',
        label: 'Open as tabs',
        onSelect: () => void openSet(set, false),
      },
      {
        id: 'open-together',
        label: 'Open together',
        disabled: together.blocked,
        description: together.blocked
          ? `A combined viewer holds ${MAX_COMBINED_MODELS} models`
          : undefined,
        onSelect: () => void openSet(set, true),
      },
      {
        id: 'copy-link',
        label: 'Copy link',
        disabled: tooManyCombined,
        description: tooManyCombined
          ? `Links carry up to ${MAX_COMBINED_MODELS} models`
          : undefined,
        onSelect: () => void copyLink(set),
      },
      { kind: 'separator', id: 'set-edit' },
      {
        id: 'rename',
        label: 'Rename',
        onSelect: () => setEditing(set.id),
      },
      {
        id: 'move-up',
        label: 'Move up',
        disabled: index === 0,
        onSelect: () => MODEL_SETS.move(set.id, -1),
      },
      {
        id: 'move-down',
        label: 'Move down',
        disabled: index === sets.length - 1,
        onSelect: () => MODEL_SETS.move(set.id, 1),
      },
      {
        id: 'delete',
        label: 'Delete',
        onSelect: () => setConfirming(set.id),
      },
    ];
  };

  return (
    <section aria-label="Model sets" className="docs-home__section">
      <h3 className="docs-home__heading">Model sets</h3>
      {sets.length > 0 ? (
        <ul className="docs-home__list">
          {sets.map((set, index) => {
            const stale = resolved[set.id]?.stale.length ?? 0;
            return (
              <li key={set.id} className="docs-home__item">
                <div className="docs-home__row">
                  <button
                    type="button"
                    className="docs-home__set"
                    aria-label={`Open ${set.name}`}
                    onClick={() => void openSet(set, false)}
                  >
                    <span className="docs-home__set-name">{set.name}</span>
                    <span className="docs-home__set-meta">
                      {plural(set.data.members.length, 'model')}
                    </span>
                  </button>
                  <Menu
                    label={`Actions for ${set.name}`}
                    title={`Actions for ${set.name}`}
                    trigger={<Icon name="more" size={14} />}
                    triggerClassName="doc-tree__view"
                    items={() => entries(set, index)}
                  />
                </div>
                {editing === set.id ? (
                  <RenameField set={set} onDone={() => setEditing(null)} />
                ) : null}
                {stale > 0 ? (
                  <p className="docs-home__note">
                    {staleText(stale)}
                    <Button onClick={() => void updateToLatest(set)}>
                      Update to latest
                    </Button>
                  </p>
                ) : null}
                {confirming === set.id ? (
                  <p className="docs-home__note">
                    {`Delete "${set.name}"?`}
                    <Button
                      aria-label="Confirm delete"
                      onClick={() => {
                        MODEL_SETS.remove(set.id);
                        setConfirming(null);
                      }}
                    >
                      Delete
                    </Button>
                    <Button
                      aria-label="Cancel delete"
                      onClick={() => setConfirming(null)}
                    >
                      Cancel
                    </Button>
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="docs-home__empty">No model sets yet.</p>
      )}
    </section>
  );
}
