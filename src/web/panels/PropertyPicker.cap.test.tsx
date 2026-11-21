import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { PropertyPicker } from './PropertyPicker.js';

vi.mock('./usePropertyCatalog.js', () => ({
  usePropertyCatalog: () => ({
    status: 'ready',
    catalog: Array.from({ length: 250 }, (_, i) => ({
      category: 'Big',
      name: `Prop ${i}`,
    })),
    reload: () => {},
    cancel: () => {},
  }),
}));

describe('PropertyPicker cap', () => {
  it('limits checkboxes per group, keeps chosen ones and narrows by search', () => {
    render(
      <PropertyPicker
        adapter={{} as ViewerAdapter}
        value={['Prop 200']}
        onChange={() => {}}
      />,
    );
    expect(screen.getAllByRole('checkbox')).toHaveLength(101);
    expect(screen.getByRole('checkbox', { name: 'Prop 200' })).toBeChecked();
    expect(screen.getByText('149 more, refine the search')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'Prop 24' },
    });
    expect(screen.queryByText(/refine the search/)).toBeNull();
  });
});
