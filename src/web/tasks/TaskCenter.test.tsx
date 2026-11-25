import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '../test/render.js';
import { notifications } from './notifications.js';
import { TaskCenter } from './TaskCenter.js';
import { createTaskStore, notifyOutcome } from './taskStore.js';

describe('TaskCenter', () => {
  it('renders nothing but the live region while no task exists', () => {
    render(<TaskCenter store={createTaskStore()} />);
    expect(screen.queryByRole('button', { name: /Tasks/ })).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('shows the running count, progress and a cancel button', () => {
    const store = createTaskStore();
    const cancel = vi.fn();
    render(<TaskCenter store={store} />);
    let handle: ReturnType<typeof store.start> | undefined;
    act(() => {
      handle = store.start({ label: 'Exporting', cancel });
      handle.progress(0.5, 'Reading');
    });
    const trigger = screen.getByRole('button', { name: 'Tasks, 1 running' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger.querySelector('[data-slot="spinner"]')).not.toBeNull();
    fireEvent.click(trigger);
    expect(screen.getByRole('list')).toHaveAttribute('data-slot', 'list');
    expect(screen.getByText('Exporting')).toBeInTheDocument();
    expect(screen.getByText('Running: Reading')).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: 'Exporting progress' }),
    ).toHaveAttribute('aria-valuenow', '50');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Cancelled: Reading')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Exporting cancelled');
  });

  it('renders and announces a warning outcome', () => {
    const store = createTaskStore();
    render(<TaskCenter store={store} />);
    act(() => {
      store.start({ label: 'Export IFC' }).warn('2 skipped');
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Export IFC finished with warnings',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tasks' }));
    expect(
      screen.getByText('Done with warnings: 2 skipped'),
    ).toBeInTheDocument();
  });

  it('announces a failure once, offers retry and clears finished tasks', () => {
    const store = createTaskStore();
    const retry = vi.fn();
    render(<TaskCenter store={store} />);
    act(() => {
      store.start({ label: 'Loading A', retry }).fail(new Error('offline'));
    });
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Loading A failed');
    fireEvent.click(screen.getByRole('button', { name: 'Tasks' }));
    expect(screen.getByText('Failed: offline')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Failed: offline')).toBeNull();
  });

  it('raises one toast for an export outcome and still lists the task', async () => {
    const store = createTaskStore(Date.now, notifyOutcome);
    render(<TaskCenter store={store} />);
    act(() => {
      store
        .start({ label: 'Exporting Excel', notify: true })
        .fail(new Error('disk full'));
    });
    const region = await screen.findByRole('region', {
      name: 'Notifications',
    });
    expect(
      await within(region).findByText('Exporting Excel failed'),
    ).toBeInTheDocument();
    expect(within(region).getByText('disk full')).toBeInTheDocument();
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Exporting Excel failed',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tasks' }));
    expect(screen.getByText('Failed: disk full')).toBeInTheDocument();
    act(() => {
      notifications.clear();
    });
  });

  it('closes on Escape and on an outside press', () => {
    const store = createTaskStore();
    render(
      <>
        <TaskCenter store={store} />
        <button type="button">Outside</button>
      </>,
    );
    act(() => {
      store.start({ label: 'A' });
    });
    const trigger = screen.getByRole('button', { name: 'Tasks, 1 running' });
    fireEvent.click(trigger);
    expect(screen.getByRole('region', { name: 'Tasks' })).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: 'A progress' }),
    ).toHaveAttribute('data-indeterminate');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: 'Tasks' })).toBeNull();
    fireEvent.click(trigger);
    const outside = screen.getByRole('button', { name: 'Outside' });
    fireEvent.pointerDown(outside);
    fireEvent.mouseDown(outside);
    fireEvent.click(outside);
    expect(screen.queryByRole('region', { name: 'Tasks' })).toBeNull();
  });
});
