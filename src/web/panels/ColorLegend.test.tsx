import { describe, expect, it, vi } from 'vitest';
import { buildColoring } from '../extensions/colorBy.js';
import { fireEvent, render, screen } from '../test/render.js';
import { applyColoring, currentColoring } from '../viewer/modelColoring.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { ColorLegend } from './ColorLegend.js';

const rows = [
  { dbId: 1, name: 'a', properties: { Category: 'Walls' }, modelId: 'm' },
  { dbId: 2, name: 'b', properties: { Category: 'Doors' }, modelId: 'm' },
];
const coloring = buildColoring(
  'property',
  'Category',
  rows,
  (row) => String(row.properties.Category),
  ['Walls', 'Doors'],
  ['#ff0000', '#0000ff'],
);

function adapter(shown = coloring) {
  const fake = {
    hideModelIds: vi.fn(),
    showModelIds: vi.fn(),
    isolateModelIds: vi.fn(),
    fitToView: vi.fn(),
    selectModelIds: vi.fn(),
    setModelThemingColor: vi.fn(),
    clearModelThemingColors: vi.fn(),
    setGhosting: vi.fn(),
    getIsolated: () => [],
  } as unknown as ViewerAdapter;
  applyColoring(fake, shown);
  return fake;
}

describe('ColorLegend', () => {
  it('lists swatch, value and count for every entry', () => {
    render(<ColorLegend adapter={adapter()} coloring={coloring} />);
    expect(
      screen.getByRole('list', { name: 'Legend for Category' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Walls')).toBeInTheDocument();
  });

  it('isolates the elements of one entry', () => {
    const fake = adapter();
    render(<ColorLegend adapter={fake} coloring={coloring} />);
    fireEvent.click(screen.getByRole('button', { name: 'Isolate Walls' }));
    expect(fake.isolateModelIds).toHaveBeenCalledWith([
      { modelId: 'm', dbId: 1 },
    ]);
  });

  it('hides and shows an entry', () => {
    const fake = adapter();
    render(<ColorLegend adapter={fake} coloring={coloring} />);
    const toggle = screen.getByRole('checkbox', { name: 'Show Doors' });
    fireEvent.click(toggle);
    expect(fake.hideModelIds).toHaveBeenCalledWith([{ modelId: 'm', dbId: 2 }]);
    fireEvent.click(toggle);
    expect(fake.showModelIds).toHaveBeenCalledWith([{ modelId: 'm', dbId: 2 }]);
  });

  it('shows a hidden group again when the colours are cleared', () => {
    const fake = adapter();
    render(<ColorLegend adapter={fake} coloring={coloring} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show Walls' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear colours' }));
    expect(fake.showModelIds).toHaveBeenCalledWith([{ modelId: 'm', dbId: 1 }]);
  });

  it('reports a colour override', () => {
    const onOverride = vi.fn();
    render(
      <ColorLegend
        adapter={adapter()}
        coloring={coloring}
        onOverride={onOverride}
      />,
    );
    fireEvent.change(screen.getByLabelText('Colour for Walls'), {
      target: { value: '#00ff00' },
    });
    expect(onOverride).toHaveBeenCalledWith('Walls', '#00ff00');
  });

  it('shows an rgb legend colour as hex in the picker', () => {
    const mixed = buildColoring(
      'property',
      'Category',
      rows,
      (row) => String(row.properties.Category),
      ['Walls', 'Doors'],
      ['rgb(255, 0, 0)', '#0000ff'],
    );
    render(
      <ColorLegend
        adapter={adapter(mixed)}
        coloring={mixed}
        onOverride={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Colour for Walls')).toHaveValue('#ff0000');
  });

  it('removes the coloring from the viewer session', () => {
    const fake = adapter();
    render(<ColorLegend adapter={fake} coloring={coloring} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear colours' }));
    expect(currentColoring(fake)).toBeNull();
  });
});
