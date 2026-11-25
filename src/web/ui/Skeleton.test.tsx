import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Skeleton } from './Skeleton.js';

describe('Skeleton', () => {
  it('renders hidden bars and keeps its children for screen readers', () => {
    render(
      <Skeleton rows={4} role="status">
        <span>Loading rows</span>
      </Skeleton>,
    );
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('data-slot', 'skeleton');
    expect(status).toHaveTextContent('Loading rows');
    const bars = status.querySelectorAll('[data-slot="skeleton-bar"]');
    expect(bars).toHaveLength(4);
    expect(bars[0]).toHaveAttribute('aria-hidden', 'true');
    expect(bars[0]).toHaveClass('motion-reduce:animate-none');
  });

  it('is tighter when small and lets the caller class win', () => {
    render(<Skeleton size="small" className="app-skeleton" />);
    expect(document.querySelector('[data-slot="skeleton"]')).toHaveClass(
      'gap-2',
      'app-skeleton',
    );
  });
});
