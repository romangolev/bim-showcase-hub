import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { viewableFor } from '../../../shared/viewState.js';
import { childrenQueryOptions } from '../../api/hooks.js';
import {
  reasonFor,
  VIEW_STATE_COPY,
} from '../../components/tree/viewStateCopy.js';
import { runIfcBatch, zipFileName } from '../../extensions/ifcBatch.js';
import type { ModalDefinition } from '../../modal/types.js';
import { startTask } from '../../tasks/taskStore.js';
import { type BatchRow, listBatchRows } from './batchSource.js';
import { IFC_SETTINGS } from './ifcSettings.js';

export const MAX_BATCH = 20;
export const CONFIRM_BATCH_ABOVE = 10;
export const MAX_PENDING_ITEMS = 100;
const FETCH_CONCURRENCY = 3;

let running = false;

export function isIfcBatchRunning(): boolean {
  return running;
}

const selectable = (row: BatchRow): boolean =>
  Boolean(row.urn) && viewableFor(row.state);

const keyOf = (row: BatchRow): string => row.urn ?? '';

function projectOf(rows: readonly BatchRow[]): string | undefined {
  const ids = new Set(rows.map((row) => row.projectId ?? ''));
  return ids.size === 1 ? rows[0]?.project : undefined;
}

function summarize(done: number, total: number, failures: string): string {
  return `Exported ${done} of ${total}. Failed: ${failures}`;
}

export function startIfcBatch(rows: readonly BatchRow[]): void {
  if (running || rows.length === 0) return;
  running = true;
  const controller = new AbortController();
  const total = rows.length;
  const task = startTask({
    label: 'Exporting IFC batch',
    cancel: () => controller.abort(),
    retry: () => startIfcBatch(rows),
  });
  const settings = IFC_SETTINGS.sanitize(IFC_SETTINGS.read());
  runIfcBatch(
    rows.map((row) => ({
      urn: row.urn as string,
      file: row.file,
      version: row.version,
    })),
    {
      settings,
      project: projectOf(rows),
      signal: controller.signal,
      onProgress: ({ index, name, phase, step }) =>
        task.progress(
          (index + step / 3) / total,
          `Exporting IFC ${index + 1} of ${total}: ${name}, ${phase}`,
        ),
    },
  )
    .then((result) => {
      running = false;
      const failures = result.failed
        .map((failure) => `${failure.name} (${failure.reason})`)
        .join('; ');
      if (result.cancelled) {
        task.cancel();
        startTask({ label: 'IFC batch cancelled' }).warn(
          result.done.length
            ? `Downloaded ${result.done.length} of ${total}`
            : 'Nothing was exported',
        );
      } else if (result.done.length === 0) {
        task.fail(`No file was exported. ${failures}`);
      } else if (result.failed.length > 0) {
        task.warn(summarize(result.done.length, total, failures));
      } else {
        const megabytes = (result.bytes / 1024 / 1024).toFixed(1);
        task.finish(`${result.done.length} files, ${megabytes} MB`);
      }
    })
    .catch((error: unknown) => {
      running = false;
      task.fail(error);
    });
}

function IfcBatchBody({ close }: { close: () => void }) {
  const client = useQueryClient();
  const [listing, setListing] = useState(() => listBatchRows(client));
  const [filter, setFilter] = useState('');
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    let live = true;
    const queue = listing.pendingItems.slice(0, MAX_PENDING_ITEMS);
    if (queue.length === 0) return;
    const next = async () => {
      for (let scope = queue.shift(); scope; scope = queue.shift()) {
        if (!live) return;
        await client
          .fetchQuery(childrenQueryOptions(scope))
          .catch(() => undefined);
      }
    };
    Promise.all(Array.from({ length: FETCH_CONCURRENCY }, next)).then(() => {
      if (live) setListing(listBatchRows(client));
    });
    return () => {
      live = false;
    };
  }, [client, listing.pendingItems]);

  const needle = filter.trim().toLowerCase();
  const visible = useMemo(
    () =>
      listing.rows.filter(
        (row) =>
          !needle ||
          `${row.file} ${row.versionName}`.toLowerCase().includes(needle),
      ),
    [listing.rows, needle],
  );
  const chosen = listing.rows.filter((row) => picked.has(keyOf(row)));
  const toggle = (row: BatchRow) =>
    setPicked((current) => {
      const next = new Set(current);
      const key = keyOf(row);
      if (next.has(key)) next.delete(key);
      else if (next.size < MAX_BATCH) next.add(key);
      return next;
    });
  const selectAll = () =>
    setPicked((current) => {
      const next = new Set(current);
      for (const row of visible) {
        if (next.size >= MAX_BATCH) break;
        if (selectable(row)) next.add(keyOf(row));
      }
      return next;
    });
  const busy = isIfcBatchRunning();
  const start = () => {
    if (
      chosen.length > CONFIRM_BATCH_ABOVE &&
      !window.confirm(
        `Export ${chosen.length} models to IFC? This can take a while.`,
      )
    ) {
      return;
    }
    close();
    startIfcBatch(chosen);
  };

  return (
    <section className="settings__section ifc-batch">
      <input
        type="search"
        aria-label="Filter versions"
        placeholder="Filter by file or version"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
      />
      <div className="settings__actions">
        <button type="button" className="btn" onClick={selectAll}>
          Select all
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => setPicked(new Set())}
        >
          Select none
        </button>
        <span className="settings__hint" aria-live="polite">
          {chosen.length} of {MAX_BATCH} selected
        </span>
      </div>
      {visible.length === 0 ? (
        <p className="settings__hint">
          No versions to list. Expand folders in Documents to list more.
        </p>
      ) : (
        <ul className="ifc-batch__list">
          {visible.map((row) => {
            const ok = selectable(row);
            const on = picked.has(keyOf(row));
            const full = !on && picked.size >= MAX_BATCH;
            return (
              <li
                key={`${row.itemScope.kind === 'item' ? row.itemScope.id : ''}:${row.versionName}:${row.urn ?? ''}`}
              >
                <label
                  className="settings__check"
                  title={ok ? undefined : reasonFor(row.state, row.checked)}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={!ok || full}
                    onChange={() => toggle(row)}
                  />
                  <span className="ifc-batch__name">
                    {row.file || 'Untitled model'} {row.version}
                  </span>
                  <span className="ifc-batch__badge">
                    {VIEW_STATE_COPY[row.state].label}
                  </span>
                </label>
                {ok ? null : (
                  <span className="settings__hint">
                    {reasonFor(row.state, row.checked)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="settings__hint">
        {chosen.length} .ifc files in{' '}
        {zipFileName(projectOf(chosen), new Date())}. Expand folders in
        Documents to list more. Unchecked versions are tried anyway.
      </p>
      <div className="settings__actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={chosen.length === 0 || busy}
          onClick={start}
        >
          Start export
        </button>
        <button type="button" className="btn" onClick={close}>
          Cancel
        </button>
      </div>
    </section>
  );
}

export const IFC_BATCH_MODAL: ModalDefinition = {
  id: 'tool-ifc-batch',
  title: 'Batch IFC export',
  size: 'lg',
  Body: IfcBatchBody,
};
