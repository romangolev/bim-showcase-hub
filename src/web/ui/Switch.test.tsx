import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FieldLabel } from './Field.js';
import { Switch } from './Switch.js';

describe('Switch', () => {
  it('is a native checkbox with the switch role and reports the new state', () => {
    const onCheckedChange = vi.fn();
    render(
      <Switch
        aria-label="Show grid"
        checked={false}
        onCheckedChange={onCheckedChange}
      />,
    );
    const control = screen.getByRole('switch', { name: 'Show grid' });
    expect(control.tagName).toBe('INPUT');
    expect(control).toHaveAttribute('data-slot', 'switch');
    expect(control).toHaveAttribute('aria-checked', 'false');
    expect(control).not.toHaveAttribute('data-checked');
    fireEvent.click(control);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('marks the checked state for themes and takes a caller class', () => {
    render(
      <Switch
        aria-label="Show grid"
        checked
        onCheckedChange={() => undefined}
        className="app-switch"
      />,
    );
    const control = screen.getByRole('switch', { name: 'Show grid' });
    expect(control).toBeChecked();
    expect(control).toHaveAttribute('data-checked');
    expect(control).toHaveClass('checked:bg-accent-fill', 'app-switch');
  });

  it('leaves the state of an uncontrolled switch to the native input', () => {
    render(<Switch aria-label="Show grid" defaultChecked />);
    const control = screen.getByRole('switch', { name: 'Show grid' });
    expect(control).toBeChecked();
    expect(control).not.toHaveAttribute('aria-checked');
    fireEvent.click(control);
    expect(control).not.toBeChecked();
  });

  it('toggles from its label and is disabled through the native attribute', () => {
    const onCheckedChange = vi.fn();
    const { rerender } = render(
      <FieldLabel layout="between">
        Show grid
        <Switch onCheckedChange={onCheckedChange} />
      </FieldLabel>,
    );
    fireEvent.click(screen.getByText('Show grid'));
    expect(onCheckedChange).toHaveBeenLastCalledWith(true);
    rerender(
      <FieldLabel layout="between">
        Show grid
        <Switch disabled onCheckedChange={onCheckedChange} />
      </FieldLabel>,
    );
    expect(screen.getByRole('switch', { name: 'Show grid' })).toBeDisabled();
  });
});
