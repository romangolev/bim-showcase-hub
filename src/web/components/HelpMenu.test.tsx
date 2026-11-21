import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '../test/render.js';
import { HelpMenu } from './HelpMenu.js';

const open = vi.fn();
vi.mock('../modal/index.js', async (load) => ({
  ...(await load<typeof import('../modal/index.js')>()),
  useModal: () => ({ open }),
}));

describe('HelpMenu', () => {
  it('opens the keyboard shortcuts window', () => {
    render(<HelpMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    fireEvent.click(
      screen.getByRole('menuitem', { name: /Keyboard shortcuts/ }),
    );
    expect(open).toHaveBeenCalledWith('help.shortcuts');
  });

  it('links to the documentation in a new tab', () => {
    render(<HelpMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    expect(
      screen.getByRole('menuitem', { name: /Documentation/ }),
    ).toBeTruthy();
  });
});
