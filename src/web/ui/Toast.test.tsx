import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Toast, Toaster } from './Toast.js';

function region() {
  return screen.getByRole('region', { name: 'Alerts' });
}

describe('Toast', () => {
  it('renders the title, the description, the icon and its children', () => {
    render(
      <Toast
        tone="danger"
        icon={<svg data-testid="icon" />}
        title="Export failed"
        description="offline"
      >
        <button type="button">Retry</button>
      </Toast>,
    );
    const card = screen
      .getByText('Export failed')
      .closest('[data-slot="toast"]');
    expect(card).toHaveAttribute('data-tone', 'danger');
    expect(card).toHaveClass('bg-surface', 'border-line', 'shadow-float');
    expect(screen.getByText('offline')).toHaveAttribute(
      'data-slot',
      'toast-description',
    );
    expect(screen.getByTestId('icon').parentElement).toHaveClass('text-danger');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('colours the icon by tone and leaves out empty parts', () => {
    const { rerender } = render(<Toast title="Saved" />);
    expect(document.querySelector('[data-slot="toast-icon"]')).toBeNull();
    expect(
      document.querySelector('[data-slot="toast-description"]'),
    ).toBeNull();
    expect(document.querySelector('[data-slot="toast"]')).toHaveAttribute(
      'data-tone',
      'neutral',
    );
    for (const [tone, colour] of [
      ['accent', 'text-accent'],
      ['success', 'text-success'],
      ['warning', 'text-warning'],
      ['neutral', 'text-fg-subtle'],
    ] as const) {
      rerender(<Toast tone={tone} icon={<svg />} title="Saved" />);
      expect(document.querySelector('[data-slot="toast-icon"]')).toHaveClass(
        colour,
      );
    }
  });
});

describe('Toaster', () => {
  it('shows each keyed child in a labelled region and removes it when it leaves', async () => {
    const { rerender } = render(
      <Toaster label="Alerts">
        <Toast key="1" title="First" />
        <Toast key="2" title="Second" />
      </Toaster>,
    );
    await waitFor(() =>
      expect(within(region()).getByText('Second')).toBeInTheDocument(),
    );
    expect(within(region()).getByText('First')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="toaster"]')).toContainElement(
      region(),
    );
    rerender(
      <Toaster label="Alerts">
        <Toast key="2" title="Second" />
      </Toaster>,
    );
    await waitFor(() => expect(screen.queryByText('First')).toBeNull());
    expect(screen.getByText('Second')).toBeInTheDocument();
  });

  it('updates a toast in place when its child changes', async () => {
    const { rerender } = render(
      <Toaster label="Alerts">
        <Toast key="1" title="Saving" />
      </Toaster>,
    );
    await screen.findByText('Saving');
    rerender(
      <Toaster label="Alerts">
        <Toast key="1" title="Saved" />
      </Toaster>,
    );
    await screen.findByText('Saved');
    expect(screen.queryByText('Saving')).toBeNull();
    expect(document.querySelectorAll('[data-sonner-toast]')).toHaveLength(1);
  });

  it('keeps its own live region quiet on request and has no hotkey in its name', async () => {
    render(
      <Toaster label="Alerts" live="off">
        <Toast key="1" title="Note" />
      </Toaster>,
    );
    await screen.findByText('Note');
    expect(region()).toHaveAttribute('aria-live', 'off');
    expect(region().getAttribute('aria-label')?.trim()).toBe('Alerts');
  });

  it('runs children with their handlers inside the toast', async () => {
    const onClick = vi.fn();
    render(
      <Toaster label="Alerts">
        <Toast key="1" title="Deleted">
          <button type="button" onClick={onClick}>
            Undo
          </button>
        </Toast>
      </Toaster>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('moves into an open modal dialog and back to the body', async () => {
    const dialog = document.createElement('dialog');
    const matches = dialog.matches.bind(dialog);
    vi.spyOn(dialog, 'matches').mockImplementation(
      (selector) => selector === ':modal' || matches(selector),
    );
    document.body.append(dialog);
    render(
      <Toaster label="Alerts">
        <Toast key="1" title="Inside" />
      </Toaster>,
    );
    await screen.findByText('Inside');
    expect(dialog).not.toContainElement(region());
    act(() => {
      dialog.setAttribute('open', '');
    });
    await waitFor(() => expect(dialog).toContainElement(region()));
    await waitFor(() =>
      expect(within(dialog).getByText('Inside')).toBeInTheDocument(),
    );
    act(() => {
      dialog.removeAttribute('open');
    });
    await waitFor(() => expect(dialog).not.toContainElement(region()));
    await screen.findByText('Inside');
    dialog.remove();
  });

  it('renders into a given container', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    render(
      <Toaster label="Alerts" container={host}>
        <Toast key="1" title="Hosted" />
      </Toaster>,
    );
    await waitFor(() =>
      expect(within(host).getByText('Hosted')).toBeInTheDocument(),
    );
    host.remove();
  });
});
