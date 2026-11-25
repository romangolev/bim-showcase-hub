import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StateBlock } from './StateBlock.js';

describe('StateBlock', () => {
  it('renders skeleton rows with a status for the loading variant', () => {
    const { container } = render(
      <StateBlock variant="loading" message="Reading elements" rows={4} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Reading elements');
    expect(container.querySelectorAll('.state-block__bar')).toHaveLength(4);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders friendly copy and a next step for the empty variant', () => {
    render(
      <StateBlock
        variant="empty"
        title="No elements"
        message="Try another version."
        action={{ label: 'Refresh', onClick: () => undefined }}
      />,
    );
    expect(screen.getByText('No elements')).toBeInTheDocument();
    expect(screen.getByText('Try another version.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders an icon, plain message, retry and keeps the raw detail in a title', () => {
    const retry = vi.fn();
    const { container } = render(
      <StateBlock
        variant="error"
        message="The service had a problem."
        detail="502 Bad Gateway"
        action={{ label: 'Retry', onClick: retry }}
      />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('The service had a problem.');
    expect(alert).not.toHaveTextContent('502');
    expect(alert).toHaveAttribute('title', '502 Bad Gateway');
    expect(container.querySelector('svg')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('renders the title as the requested heading and a primary action', () => {
    render(
      <StateBlock
        variant="empty"
        title="Page not found"
        titleAs="h1"
        action={{ label: 'Go back', onClick: () => undefined, primary: true }}
      />,
    );
    expect(
      screen.getByRole('heading', { level: 1, name: 'Page not found' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go back' })).toHaveAttribute(
      'data-variant',
      'primary',
    );
  });
});
