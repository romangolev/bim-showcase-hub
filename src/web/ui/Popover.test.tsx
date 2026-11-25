import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  Popover,
  PopoverClose,
  PopoverPopup,
  PopoverTitle,
  PopoverTrigger,
} from './Popover.js';

function Sample() {
  return (
    <Popover>
      <PopoverTrigger>Tint</PopoverTrigger>
      <PopoverPopup>
        <PopoverTitle>Model tint</PopoverTitle>
        <input aria-label="Strength" />
        <PopoverClose>Done</PopoverClose>
      </PopoverPopup>
    </Popover>
  );
}

describe('Popover', () => {
  it('opens a dialog named by its title from the trigger', () => {
    render(<Sample />);
    const trigger = screen.getByRole('button', { name: 'Tint' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('data-slot', 'popover-trigger');
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const popup = screen.getByRole('dialog', { name: 'Model tint' });
    expect(popup).toHaveAttribute('data-slot', 'popover-popup');
    expect(popup).toHaveClass('bg-surface', 'z-popup');
    expect(screen.getByRole('textbox', { name: 'Strength' })).toBeTruthy();
  });

  it('closes from the close part and on Escape', async () => {
    render(<Sample />);
    const trigger = screen.getByRole('button', { name: 'Tint' });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('portals into the surrounding dialog', () => {
    render(
      <dialog open aria-label="Host">
        <Sample />
      </dialog>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tint' }));
    expect(
      screen.getByRole('dialog', { name: 'Model tint' }).closest('dialog'),
    ).not.toBeNull();
  });
});
