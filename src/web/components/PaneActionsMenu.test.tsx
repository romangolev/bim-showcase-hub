import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PaneActionsMenu } from './PaneActionsMenu.js';

function setup() {
  const copy = vi.fn();
  const blocked = vi.fn();
  render(
    <PaneActionsMenu
      label="Summary actions"
      actions={() => [
        { id: 'copy', label: 'Copy table', onSelect: copy },
        { kind: 'separator', id: 'sep' },
        { id: 'show', label: 'Show all', disabled: true, onSelect: blocked },
        { id: 'csv', label: 'Download CSV', icon: 'table', onSelect: vi.fn() },
      ]}
    />,
  );
  const trigger = screen.getByRole('button', { name: 'Summary actions' });
  return { copy, blocked, trigger };
}

describe('PaneActionsMenu', () => {
  it('opens and closes from the trigger and reports the state', () => {
    const { trigger } = setup();
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('data-slot', 'icon-button');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByRole('menu', { name: 'Summary actions' }),
    ).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('runs an action, closes and returns focus to the trigger', () => {
    const { copy, trigger } = setup();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy table' }));
    expect(copy).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('opens with the keyboard, skips disabled actions and closes on Escape', () => {
    const { copy, trigger } = setup();
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const menu = screen.getByRole('menu');
    expect(screen.getByRole('menuitem', { name: 'Copy table' })).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(
      screen.getByRole('menuitem', { name: 'Download CSV' }),
    ).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();
    fireEvent.keyDown(trigger, { key: 'Enter' });
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Enter' });
    expect(copy).toHaveBeenCalledTimes(1);
  });

  it('does not run a disabled action', () => {
    const { blocked, trigger } = setup();
    fireEvent.click(trigger);
    const item = screen.getByRole('menuitem', { name: 'Show all' });
    expect(item).toBeDisabled();
    fireEvent.click(item);
    expect(blocked).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('shows the icon of a plain action and a text trigger as a button', () => {
    render(
      <PaneActionsMenu
        label="Dashboard actions"
        text="Actions"
        actions={() => [
          { id: 'add', label: 'Add chart', icon: 'plus', onSelect: vi.fn() },
        ]}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Dashboard actions' });
    expect(trigger).toHaveAttribute('data-slot', 'button');
    expect(trigger).toHaveTextContent('Actions');
    fireEvent.click(trigger);
    expect(
      screen
        .getByRole('menuitem', { name: 'Add chart' })
        .querySelector('.menu__icon'),
    ).not.toBeNull();
  });
});
