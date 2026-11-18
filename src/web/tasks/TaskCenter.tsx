import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '../components/icons.js';
import type { Task, TaskStore } from './taskStore.js';
import { useTasks } from './useTasks.js';

const STATE_TEXT: Record<Task['state'], string> = {
  running: 'Running',
  done: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

function TaskRow({
  task,
  onCancel,
  onRetry,
  onDismiss,
}: {
  task: Task;
  onCancel: () => void;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const percent =
    task.progress === null ? null : Math.round(task.progress * 100);
  return (
    <li className="task-row" data-state={task.state}>
      <div className="task-row__text">
        <span className="task-row__label">{task.label}</span>
        <span className="task-row__detail">
          {STATE_TEXT[task.state]}
          {task.detail ? `: ${task.detail}` : ''}
        </span>
        {task.state === 'running' ? (
          <progress
            className="task-row__bar"
            aria-label={`${task.label} progress`}
            max={100}
            {...(percent === null ? {} : { value: percent })}
          />
        ) : null}
      </div>
      {task.state === 'running' && task.cancellable ? (
        <button type="button" className="btn btn-small" onClick={onCancel}>
          Cancel
        </button>
      ) : null}
      {task.state === 'failed' && task.retryable ? (
        <button type="button" className="btn btn-small" onClick={onRetry}>
          Retry
        </button>
      ) : null}
      {task.state !== 'running' ? (
        <button
          type="button"
          className="icon-button task-row__dismiss"
          aria-label={`Dismiss ${task.label}`}
          onClick={onDismiss}
        >
          <Icon name="close" size={14} />
        </button>
      ) : null}
    </li>
  );
}

export function TaskCenter({ store }: { store?: TaskStore }) {
  const center = useTasks(store);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const failed = center.tasks.some((task) => task.state === 'failed');

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const finished = center.tasks.filter((task) => task.state !== 'running');
  const shown = [...center.tasks].reverse();

  return (
    <div className="task-center" ref={root}>
      <div className="visually-hidden" role="status" aria-live="polite">
        {center.announcement}
      </div>
      {center.tasks.length > 0 ? (
        <button
          type="button"
          className="icon-button task-center__trigger"
          aria-label={
            center.running > 0 ? `Tasks, ${center.running} running` : 'Tasks'
          }
          aria-expanded={open}
          aria-controls={listId}
          data-failed={failed}
          onClick={() => setOpen((value) => !value)}
        >
          <Icon
            name={center.running > 0 ? 'spinner' : failed ? 'alert' : 'check'}
            size={18}
            className={center.running > 0 ? 'spin' : undefined}
          />
          {center.running > 0 ? (
            <span className="task-center__count" aria-hidden="true">
              {center.running}
            </span>
          ) : null}
        </button>
      ) : null}
      {open && center.tasks.length > 0 ? (
        <section
          id={listId}
          className="task-center__popover"
          aria-label="Tasks"
        >
          <ul className="task-center__list">
            {shown.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onCancel={() => center.cancel(task.id)}
                onRetry={() => center.retry(task.id)}
                onDismiss={() => center.dismiss(task.id)}
              />
            ))}
          </ul>
          {finished.length > 0 ? (
            <button
              type="button"
              className="btn btn-small"
              onClick={center.clearFinished}
            >
              Clear finished
            </button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
