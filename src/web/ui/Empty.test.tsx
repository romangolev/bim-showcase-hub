import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from './Empty.js';

function Sample({ tone }: { tone?: 'neutral' | 'danger' }) {
  return (
    <Empty tone={tone} role={tone === 'danger' ? 'alert' : undefined}>
      <EmptyMedia>icon</EmptyMedia>
      <EmptyContent>
        <EmptyTitle render={(props) => <h2 {...props} />}>
          Nothing here
        </EmptyTitle>
        <EmptyDescription>Open a model</EmptyDescription>
      </EmptyContent>
    </Empty>
  );
}

describe('Empty', () => {
  it('renders the slots and a title in the element it is given', () => {
    render(<Sample />);
    expect(
      screen.getByRole('heading', { level: 2, name: 'Nothing here' }),
    ).toHaveAttribute('data-slot', 'empty-title');
    expect(screen.getByText('Open a model')).toHaveAttribute(
      'data-slot',
      'empty-description',
    );
    expect(screen.getByText('icon')).toHaveClass('text-fg-subtle');
    expect(document.querySelector('[data-slot="empty"]')).toHaveAttribute(
      'data-tone',
      'neutral',
    );
  });

  it('colours the icon and the message in the danger tone', () => {
    render(<Sample tone="danger" />);
    expect(screen.getByRole('alert')).toHaveAttribute('data-tone', 'danger');
    expect(screen.getByText('icon')).toHaveClass('text-danger');
    expect(screen.getByText('Open a model')).toHaveClass('text-danger');
  });

  it('is tighter when small and lets the caller class win', () => {
    render(<Empty size="small" className="app-empty" />);
    const root = document.querySelector('[data-slot="empty"]');
    expect(root).toHaveClass('gap-2', 'py-1', 'app-empty');
  });
});
