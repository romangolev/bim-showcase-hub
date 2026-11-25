import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card, CardHeader, CardTitle } from './Card.js';

describe('Card', () => {
  it('is a region named by its title with header and title slots', () => {
    render(
      <Card aria-labelledby="t">
        <CardHeader>
          <CardTitle id="t">Models</CardTitle>
        </CardHeader>
      </Card>,
    );
    const card = screen.getByRole('region', { name: 'Models' });
    expect(card).toHaveAttribute('data-slot', 'card');
    expect(card).toHaveClass('bg-surface', 'rounded-surface', 'p-3');
    expect(card.querySelector('header')).toHaveAttribute(
      'data-slot',
      'card-header',
    );
    expect(screen.getByRole('heading', { level: 2 })).toHaveAttribute(
      'data-slot',
      'card-title',
    );
  });

  it('lets the caller class win', () => {
    render(<Card aria-label="x" className="app-card" />);
    expect(screen.getByRole('region')).toHaveClass('app-card');
  });
});
