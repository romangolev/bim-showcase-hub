import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import { ModalProvider, useModal } from './index.js';
import type { ModalDefinition } from './types.js';

beforeAll(() => {
  const proto = HTMLDialogElement.prototype;
  proto.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  proto.close = function close() {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

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
    fireEvent(screen.getByRole('dialog'), new Event('close'));
    expect(screen.queryByRole('dialog')).toBeNull();
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
