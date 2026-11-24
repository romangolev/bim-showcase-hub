import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button.js';

describe('Button', () => {
  it('renders a native button that honours the hit target', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveAttribute('data-slot', 'button');
    expect(button).toHaveClass('min-h-hit', 'border-hairline', 'bg-ghost-fill');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire when disabled', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('data-disabled');
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('applies the variant, the size and a caller class over the defaults', () => {
    render(
      <Button variant="primary" size="small" className="rounded-pill">
        Open
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Open' });
    expect(button).toHaveClass(
      'bg-bone',
      'text-ink',
      'text-13',
      'rounded-pill',
    );
    expect(button).not.toHaveClass('text-14');
    expect(button).not.toHaveClass('rounded-button');
    expect(button).not.toHaveClass('bg-ghost-fill');
  });
});
