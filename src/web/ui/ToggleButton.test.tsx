import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ToggleButton } from './ToggleButton.js';

describe('ToggleButton', () => {
  it('reports the pressed state to assistive tech and to CSS', () => {
    const { rerender } = render(<ToggleButton pressed>Grid</ToggleButton>);
    const button = screen.getByRole('button', { name: 'Grid' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveAttribute('data-pressed');
    expect(button).toHaveAttribute('data-slot', 'toggle-button');
    expect(button).toHaveClass('data-pressed:border-accent', 'min-h-hit');
    rerender(<ToggleButton pressed={false}>Grid</ToggleButton>);
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).not.toHaveAttribute('data-pressed');
  });

  it('fires onClick and onPressedChange, and stays controlled', () => {
    const onClick = vi.fn();
    const onPressedChange = vi.fn();
    render(
      <ToggleButton
        pressed={false}
        onClick={onClick}
        onPressedChange={onPressedChange}
      >
        Grid
      </ToggleButton>,
    );
    const button = screen.getByRole('button', { name: 'Grid' });
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onPressedChange).toHaveBeenCalledWith(true, expect.anything());
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('toggles on Space and Enter through the native button', () => {
    render(<ToggleButton defaultPressed={false}>Grid</ToggleButton>);
    const button = screen.getByRole('button', { name: 'Grid' });
    expect(button.tagName).toBe('BUTTON');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  it('does nothing when disabled, and takes the small size', () => {
    const onPressedChange = vi.fn();
    render(
      <ToggleButton disabled size="small" onPressedChange={onPressedChange}>
        Grid
      </ToggleButton>,
    );
    const button = screen.getByRole('button', { name: 'Grid' });
    expect(button).toBeDisabled();
    expect(button).toHaveClass('text-13');
    fireEvent.click(button);
    expect(onPressedChange).not.toHaveBeenCalled();
  });
});
