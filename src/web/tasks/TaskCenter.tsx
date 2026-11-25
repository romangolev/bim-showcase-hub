import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '../components/icons.js';
import { Button } from '../ui/Button.js';
import { IconButton } from '../ui/IconButton.js';
import { NotificationHost } from './NotificationHost.js';
import {
  type NotificationStore,
  notifications as notificationsStore,
} from './notifications.js';
import type { Task, TaskStore } from './taskStore.js';
import { useTasks } from './useTasks.js';

const STATE_TEXT: Record<Task['state'], string> = {
  running: 'Running',
  done: 'Done',
  warning: 'Done with warnings',
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
        <Button size="small" onClick={onCancel}>
          Cancel
        </Button>
      ) : null}
      {task.state === 'failed' && task.retryable ? (
        <Button size="small" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
      {task.state !== 'running' ? (
        <IconButton
          className="task-row__dismiss"
          label={`Dismiss ${task.label}`}
          onClick={onDismiss}
        >
          <Icon name="close" size={14} />
        </IconButton>
      ) : null}
    </li>
  );
}

export function TaskCenter({
  store,
  notifications: notificationStore = notificationsStore,
}: {
  store?: TaskStore;
  notifications?: NotificationStore;
}) {
  const center = useTasks(store);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const failed = center.tasks.some((task) => task.state === 'failed');
  const warned = center.tasks.some((task) => task.state === 'warning');

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

  useEffect(() => {
    if (center.announcement) notificationStore.announce(center.announcement);
  }, [center.announcement, notificationStore]);

  const finished = center.tasks.filter((task) => task.state !== 'running');
  const shown = [...center.tasks].reverse();

  return (
    <div className="task-center" ref={root}>
      <NotificationHost store={notificationStore} />
      {center.tasks.length > 0 ? (
        <IconButton
          className="task-center__trigger"
          label={
            center.running > 0 ? `Tasks, ${center.running} running` : 'Tasks'
          }
          aria-expanded={open}
          aria-controls={listId}
          data-failed={failed}
          data-warning={warned && !failed}
          onClick={() => setOpen((value) => !value)}
        >
          <Icon
            name={
              center.running > 0
                ? 'spinner'
                : failed || warned
                  ? 'alert'
                  : 'check'
            }
            size={18}
            className={center.running > 0 ? 'spin' : undefined}
          />
          {center.running > 0 ? (
            <span className="task-center__count" aria-hidden="true">
              {center.running}
            </span>
          ) : null}
        </IconButton>
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
            <Button size="small" onClick={center.clearFinished}>
              Clear finished
            </Button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
