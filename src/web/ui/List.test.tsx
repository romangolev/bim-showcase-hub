import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { List, ListItem } from './List.js';

describe('List', () => {
  it('is a named list of rows', () => {
    render(
      <List aria-label="Saved items">
        <ListItem>One</ListItem>
        <ListItem>Two</ListItem>
      </List>,
    );
    const list = screen.getByRole('list', { name: 'Saved items' });
    expect(list.tagName).toBe('UL');
    expect(list).toHaveAttribute('data-slot', 'list');
    expect(screen.getAllByRole('listitem')[0]).toHaveAttribute(
      'data-slot',
      'list-item',
    );
  });

  it('renders an ordered list through render and lets the caller class win', () => {
    render(<List render={<ol />} className="app-list" />);
    const list = screen.getByRole('list');
    expect(list.tagName).toBe('OL');
    expect(list).toHaveClass('app-list');
  });
});
