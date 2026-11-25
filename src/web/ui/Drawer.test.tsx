import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CardTitle } from './Card.js';
import { Drawer, DrawerBody, DrawerHeader } from './Drawer.js';

function Sample({ collapsed }: { collapsed?: boolean }) {
  return (
    <Drawer aria-labelledby="t" collapsed={collapsed}>
      <DrawerHeader>
        <CardTitle id="t">Colors</CardTitle>
      </DrawerHeader>
      <DrawerBody>Body</DrawerBody>
    </Drawer>
  );
}

describe('Drawer', () => {
  it('is a named region with a sticky header and a scrolling body', () => {
    render(<Sample />);
    const drawer = screen.getByRole('region', { name: 'Colors' });
    expect(drawer).toHaveAttribute('data-slot', 'drawer');
    expect(drawer).not.toHaveAttribute('data-collapsed');
    expect(drawer).toHaveClass('group/drawer', 'p-0');
    const header = drawer.querySelector('[data-slot="drawer-header"]');
    expect(header).toHaveClass('sticky', 'z-sticky');
    const body = screen.getByText('Body');
    expect(body).toHaveAttribute('data-slot', 'drawer-body');
    expect(body).toHaveClass('h-(--ui-drawer-body)', 'overflow-auto');
  });

  it('marks the collapsed state for the body to fold', () => {
    render(<Sample collapsed />);
    const drawer = screen.getByRole('region', { name: 'Colors' });
    expect(drawer).toHaveAttribute('data-collapsed', '');
    expect(screen.getByText('Body')).toHaveClass(
      'group-data-collapsed/drawer:h-0',
      'group-data-collapsed/drawer:invisible',
    );
  });

  it('lets the caller class win', () => {
    render(
      <Drawer aria-label="x" className="app-drawer">
        <DrawerBody className="app-body" />
      </Drawer>,
    );
    expect(screen.getByRole('region')).toHaveClass('app-drawer');
    expect(document.querySelector('[data-slot="drawer-body"]')).toHaveClass(
      'app-body',
    );
  });
});
