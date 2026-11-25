import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from './Badge.js';

describe('Badge', () => {
  it('renders a span with the slot and its data attributes', () => {
    render(<Badge>Viewable</Badge>);
    const badge = screen.getByText('Viewable');
    expect(badge.tagName).toBe('SPAN');
    expect(badge).toHaveAttribute('data-slot', 'badge');
    expect(badge).toHaveAttribute('data-variant', 'outline');
    expect(badge).toHaveAttribute('data-tone', 'neutral');
    expect(badge).toHaveAttribute('data-size', 'default');
  });

  it('colours the outline and the text by tone', () => {
    render(
      <>
        <Badge tone="accent">A</Badge>
        <Badge tone="danger">D</Badge>
        <Badge tone="success">S</Badge>
      </>,
    );
    expect(screen.getByText('A')).toHaveClass('text-accent', 'border-accent');
    expect(screen.getByText('D')).toHaveClass('text-danger', 'border-danger');
    expect(screen.getByText('S')).toHaveClass('text-success', 'border-success');
  });

  it('has soft, plain and chip variants and a small size', () => {
    render(
      <>
        <Badge variant="soft" tone="accent" size="small">
          Soft
        </Badge>
        <Badge variant="plain">Plain</Badge>
        <Badge variant="chip">Chip</Badge>
      </>,
    );
    expect(screen.getByText('Soft')).toHaveClass('bg-accent-tint', 'px-1.5');
    expect(screen.getByText('Plain')).toHaveClass('border-transparent');
    expect(screen.getByText('Chip')).toHaveClass('rounded-pill');
  });

  it('renders another element through render', () => {
    render(
      <ul>
        <Badge variant="chip" render={<li />}>
          Name
        </Badge>
      </ul>,
    );
    const item = screen.getByRole('listitem');
    expect(item).toHaveAttribute('data-slot', 'badge');
    expect(item).toHaveTextContent('Name');
  });

  it('lets the caller class win', () => {
    render(<Badge className="app-badge">X</Badge>);
    expect(screen.getByText('X')).toHaveClass('app-badge');
  });
});
