import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './Dialog.js';
import { type UIStrings, UIStringsProvider } from './strings.js';

const STRINGS: UIStrings = {
  close: 'Close',
  dismiss: 'Dismiss',
  increase: 'Increase',
  decrease: 'Decrease',
  loading: 'Loading',
  clear: 'Clear',
  more: 'More',
};

function Sample({ onClose }: { onClose: () => void }) {
  return (
    <UIStringsProvider strings={STRINGS}>
      <Dialog onClose={onClose} size="sm">
        <DialogHeader>
          <DialogTitle>Rename preset</DialogTitle>
          <DialogClose>x</DialogClose>
        </DialogHeader>
        <DialogBody>
          <input aria-label="Name" />
        </DialogBody>
        <DialogFooter>
          <button type="button">Save</button>
        </DialogFooter>
      </Dialog>
    </UIStringsProvider>
  );
}

function Opener() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open ? <Sample onClose={() => setOpen(false)} /> : null}
    </>
  );
}

describe('Dialog', () => {
  it('is a native modal dialog named by its title', () => {
    render(<Sample onClose={() => undefined} />);
    const dialog = screen.getByRole('dialog', { name: 'Rename preset' });
    expect(dialog.tagName).toBe('DIALOG');
    expect(dialog).toHaveAttribute('open');
    expect(dialog).toHaveAttribute('data-slot', 'dialog');
    expect(dialog).toHaveAttribute('data-size', 'sm');
    expect(dialog).toHaveClass('w-dialog-sm', 'bg-surface');
    for (const part of ['header', 'title', 'body', 'footer']) {
      expect(
        dialog.querySelector(`[data-slot="dialog-${part}"]`),
      ).not.toBeNull();
    }
  });

  it('takes aria-label instead of a title', () => {
    render(
      <Dialog onClose={() => undefined} aria-label="Command palette">
        <DialogBody />
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Command palette' });
    expect(dialog).not.toHaveAttribute('aria-labelledby');
  });

  it('closes from the close button, named by UIStrings', () => {
    const onClose = vi.fn();
    render(<Sample onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape through the native close event', () => {
    const onClose = vi.fn();
    render(<Sample onClose={onClose} />);
    screen.getByRole<HTMLDialogElement>('dialog').close();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on a press and release on the backdrop only', () => {
    const onClose = vi.fn();
    render(<Sample onClose={onClose} />);
    const dialog = screen.getByRole('dialog');
    const input = screen.getByRole('textbox', { name: 'Name' });
    fireEvent.mouseDown(input);
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(dialog);
    fireEvent.click(input);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(dialog);
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('returns focus to the opener when it unmounts', () => {
    render(<Opener />);
    const opener = screen.getByRole('button', { name: 'Open' });
    opener.focus();
    fireEvent.click(opener);
    screen.getByRole('textbox', { name: 'Name' }).focus();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('opens and closes with the open prop and renders no content while closed', () => {
    const { rerender } = render(
      <Dialog open={false} onClose={() => undefined} aria-label="Report">
        <DialogBody>content</DialogBody>
      </Dialog>,
    );
    expect(screen.queryByText('content')).toBeNull();
    rerender(
      <Dialog open onClose={() => undefined} aria-label="Report">
        <DialogBody>content</DialogBody>
      </Dialog>,
    );
    expect(screen.getByRole('dialog', { name: 'Report' })).toHaveAttribute(
      'open',
    );
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('throws when the close button has no strings provider', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      render(
        <Dialog onClose={() => undefined} aria-label="Report">
          <DialogClose />
        </Dialog>,
      ),
    ).toThrow(/UIStringsProvider/);
    error.mockRestore();
  });
});
