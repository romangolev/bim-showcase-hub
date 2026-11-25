import { useEffect, useId, useState } from 'react';
import { Icon } from '../components/icons.js';
import { Button } from '../ui/Button.js';
import { IconButton } from '../ui/IconButton.js';
import { List, ListItem } from '../ui/List.js';
import { Popover, PopoverPopup, PopoverTrigger } from '../ui/Popover.js';
import { Progress } from '../ui/Progress.js';
import { Spinner } from '../ui/Spinner.js';
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
    <ListItem className="task-row" data-state={task.state}>
      <div className="task-row__text">
        <span className="task-row__label">{task.label}</span>
        <span className="task-row__detail">
          {STATE_TEXT[task.state]}
          {task.detail ? `: ${task.detail}` : ''}
        </span>
        {task.state === 'running' ? (
          <Progress label={`${task.label} progress`} value={percent} />
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
    </ListItem>
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
  const listId = useId();
  const failed = center.tasks.some((task) => task.state === 'failed');
  const warned = center.tasks.some((task) => task.state === 'warning');

  useEffect(() => {
    if (center.tasks.length === 0) setOpen(false);
  }, [center.tasks.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (center.announcement) notificationStore.announce(center.announcement);
  }, [center.announcement, notificationStore]);

  const finished = center.tasks.filter((task) => task.state !== 'running');
  const shown = [...center.tasks].reverse();

  return (
    <div className="task-center">
      <NotificationHost store={notificationStore} />
      <Popover open={open} onOpenChange={(next) => setOpen(next)}>
        {center.tasks.length > 0 ? (
          <PopoverTrigger
            render={
              <IconButton
                className="task-center__trigger"
                label={
                  center.running > 0
                    ? `Tasks, ${center.running} running`
                    : 'Tasks'
                }
                data-failed={failed}
                data-warning={warned && !failed}
              />
            }
          >
            {center.running > 0 ? (
              <Spinner size={18} />
            ) : (
              <Icon name={failed || warned ? 'alert' : 'check'} size={18} />
            )}
            {center.running > 0 ? (
              <span className="task-center__count" aria-hidden="true">
                {center.running}
              </span>
            ) : null}
          </PopoverTrigger>
        ) : null}
        <PopoverPopup className="task-center__popover">
          <section id={listId} aria-label="Tasks">
            <List className="task-center__list">
              {shown.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onCancel={() => center.cancel(task.id)}
                  onRetry={() => center.retry(task.id)}
                  onDismiss={() => center.dismiss(task.id)}
                />
              ))}
            </List>
            {finished.length > 0 ? (
              <Button size="small" onClick={center.clearFinished}>
                Clear finished
              </Button>
            ) : null}
          </section>
        </PopoverPopup>
      </Popover>
    </div>
  );
}
