import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox } from './Checkbox.js';

describe('Checkbox', () => {
  it('is a native checkbox that reports the new state', () => {
    const onCheckedChange = vi.fn();
    const onChange = vi.fn();
    render(
      <Checkbox
        aria-label="Ghost the rest"
        checked={false}
        onChange={onChange}
        onCheckedChange={onCheckedChange}
        className="app-check"
      />,
    );
    const box = screen.getByRole('checkbox', { name: 'Ghost the rest' });
    expect(box.tagName).toBe('INPUT');
    expect(box).toHaveAttribute('data-slot', 'checkbox');
    expect(box).toHaveClass('accent-accent-fill', 'app-check');
    expect(box).not.toHaveAttribute('data-checked');
    fireEvent.click(box);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('marks the checked state and honours disabled', () => {
    render(
      <label>
        Ghost the rest
        <Checkbox checked disabled onCheckedChange={() => undefined} />
      </label>,
    );
    const box = screen.getByRole('checkbox', { name: 'Ghost the rest' });
    expect(box).toBeChecked();
    expect(box).toBeDisabled();
    expect(box).toHaveAttribute('data-checked');
  });
});
