import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Kbd } from './Kbd.js';

describe('Kbd', () => {
  it('renders a kbd chip with the slot', () => {
    render(<Kbd>Ctrl+K</Kbd>);
    const kbd = screen.getByText('Ctrl+K');
    expect(kbd.tagName).toBe('KBD');
    expect(kbd).toHaveAttribute('data-slot', 'kbd');
    expect(kbd).toHaveClass('rounded-badge', 'border-line');
  });

  it('lets the caller class win', () => {
    render(<Kbd className="app-kbd">F</Kbd>);
    expect(screen.getByText('F')).toHaveClass('app-kbd');
  });
});
