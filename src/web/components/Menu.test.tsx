import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
    expect(screen.getByRole('menu').parentElement).toBe(document.body);
  });
});
