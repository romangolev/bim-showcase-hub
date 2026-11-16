import { act, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { ModalProvider, useModal } from './index.js';
import type { ModalDefinition } from './types.js';

const DEFINITIONS: ModalDefinition[] = [
  {
    id: 'demo',
    title: 'Demo',
    size: 'sm',
    Body: ({ close }) => (
      <button type="button" onClick={close}>
        Done
      </button>
    ),
  },
];

function Trigger({ id }: { id: string }) {
  const modal = useModal();
  return (
    <button type="button" onClick={() => modal.open(id)}>
      Open {id}
    </button>
  );
}

function Harness() {
  const [tick, setTick] = useState(0);
  return (
    <ModalProvider definitions={[...DEFINITIONS]}>
      <Trigger id="demo" />
      <button type="button" onClick={() => setTick(tick + 1)}>
        Rerender
      </button>
    </ModalProvider>
  );
}

function renderModal(id: string) {
  render(
    <ModalProvider definitions={DEFINITIONS}>
      <Trigger id={id} />
    </ModalProvider>,
  );
}

describe('ModalProvider', () => {
  it('opens a registered modal with its title and body', () => {
    renderModal('demo');
    fireEvent.click(screen.getByText('Open demo'));
    expect(screen.getByRole('dialog', { name: 'Demo' })).toBeTruthy();
    expect(screen.getByText('Done')).toBeTruthy();
  });

  it('closes from the body and from the header button', () => {
    renderModal('demo');
    fireEvent.click(screen.getByText('Open demo'));
    fireEvent.click(screen.getByText('Done'));
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByText('Open demo'));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes when the dialog reports close, which is what Escape does', () => {
    renderModal('demo');
    fireEvent.click(screen.getByText('Open demo'));
    const dialog = screen.getByRole('dialog');
    dialog.removeAttribute('open');
    fireEvent(dialog, new Event('close'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('stays open through StrictMode remounts with an asynchronous close event', async () => {
    const proto = HTMLDialogElement.prototype;
    const originalClose = proto.close;
    proto.close = function close() {
      this.removeAttribute('open');
      queueMicrotask(() => this.dispatchEvent(new Event('close')));
    };
    try {
      render(
        <StrictMode>
          <ModalProvider definitions={DEFINITIONS}>
            <Trigger id="demo" />
          </ModalProvider>
        </StrictMode>,
      );
      fireEvent.click(screen.getByText('Open demo'));
      expect(screen.getByRole('dialog', { name: 'Demo' })).toBeTruthy();
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(screen.getByRole('dialog', { name: 'Demo' })).toBeTruthy();
    } finally {
      proto.close = originalClose;
    }
  });

  it('closes on a backdrop click but not on a click inside the panel', () => {
    renderModal('demo');
    fireEvent.click(screen.getByText('Open demo'));
    fireEvent.click(screen.getByText('Demo'));
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('dialog'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('stays open when the provider re-renders with a new definitions array', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('Open demo'));
    fireEvent.click(screen.getByText('Rerender'));
    expect(screen.getByRole('dialog', { name: 'Demo' })).toBeTruthy();
  });

  it('ignores an unknown id', () => {
    renderModal('missing');
    fireEvent.click(screen.getByText('Open missing'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('returns focus to the trigger on close', () => {
    renderModal('demo');
    const trigger = screen.getByText('Open demo');
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByText('Done'));
    expect(document.activeElement).toBe(trigger);
  });

  it('throws when used outside the provider', () => {
    expect(() => render(<Trigger id="demo" />)).toThrow();
  });
});
