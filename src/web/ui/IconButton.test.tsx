import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { IconButton } from './IconButton.js';

describe('IconButton', () => {
  it('takes its accessible name from the required label', () => {
    const onClick = vi.fn();
    render(
      <IconButton label="Close" onClick={onClick}>
        <svg aria-hidden="true" />
      </IconButton>,
    );
    const button = screen.getByRole('button', { name: 'Close' });
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveAttribute('data-slot', 'icon-button');
    expect(button).toHaveClass('size-hit', 'border-line');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire when disabled', () => {
    const onClick = vi.fn();
    render(<IconButton label="Close" disabled onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'Close' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('keeps a title and a caller class, and passes ARIA state through', () => {
    render(
      <IconButton
        label="Options"
        title="Options"
        aria-expanded={false}
        aria-haspopup="menu"
        className="app-class"
      />,
    );
    const button = screen.getByRole('button', { name: 'Options' });
    expect(button).toHaveAttribute('title', 'Options');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('aria-haspopup', 'menu');
    expect(button).toHaveClass('app-class', 'size-hit');
  });
});
