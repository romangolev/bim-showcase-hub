import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Spinner } from './Spinner.js';

describe('Spinner', () => {
  it('is decorative by default and spins unless motion is reduced', () => {
    const { container } = render(<Spinner size={12} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('data-slot', 'spinner');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('width', '12');
    expect(svg).toHaveClass('animate-spin', 'motion-reduce:animate-none');
  });

  it('is an image named by its label', () => {
    render(<Spinner label="Working" />);
    const svg = screen.getByRole('img', { name: 'Working' });
    expect(svg).not.toHaveAttribute('aria-hidden');
  });

  it('lets the caller class win', () => {
    const { container } = render(<Spinner className="app-spin" />);
    expect(container.querySelector('svg')).toHaveClass('app-spin');
  });
});
