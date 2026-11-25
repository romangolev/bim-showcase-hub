import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Menu } from './Menu.js';

const items = () => [{ id: 'a', label: 'Alpha', onSelect: () => {} }];

describe('Menu', () => {
  it('opens inside the surrounding dialog so a modal keeps it interactive', () => {
    render(
      <dialog open>
        <Menu label="Things" trigger="Open" items={items} />
      </dialog>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Things' }));
    expect(screen.getByRole('menu').closest('dialog')).not.toBeNull();
  });

  it('opens in the body without a dialog', () => {
    render(<Menu label="Things" trigger="Open" items={items} />);
    fireEvent.click(screen.getByRole('button', { name: 'Things' }));
    const menu = screen.getByRole('menu');
    expect(menu.closest('dialog')).toBeNull();
    expect(document.body.contains(menu)).toBe(true);
  });

  it('opens a context menu inside the open modal dialog', () => {
    const dialog = document.createElement('dialog');
    const matches = dialog.matches.bind(dialog);
    vi.spyOn(dialog, 'matches').mockImplementation(
      (selector) => selector === ':modal' || matches(selector),
    );
    dialog.setAttribute('open', '');
    document.body.append(dialog);
    render(<Menu label="Things" anchor={{ x: 5, y: 5 }} items={items} />);
    expect(dialog).toContainElement(screen.getByRole('menu'));
    dialog.remove();
  });

  it('shows a description on a checkable entry too', () => {
    render(
      <Menu
        label="Things"
        trigger="Open"
        items={() => [
          {
            id: 'a',
            label: 'Alpha',
            checked: false,
            description: 'Not in this model: Area',
            onSelect: () => {},
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Things' }));
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Alpha' }),
    ).toHaveAttribute('title', 'Not in this model: Area');
  });
});
