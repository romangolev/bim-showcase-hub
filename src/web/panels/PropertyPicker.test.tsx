import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { MockViewerAdapter } from '../viewer/MockViewerAdapter.js';
import { PropertyPicker } from './PropertyPicker.js';

function Harness({
  adapter,
  seen,
}: {
  adapter: MockViewerAdapter | null;
  seen: string[][];
}) {
  const [value, setValue] = useState<readonly string[]>(['Name']);
  return (
    <PropertyPicker
      adapter={adapter}
      value={value}
      onChange={(next) => {
        seen.push([...next]);
        setValue(next);
      }}
    />
  );
}

async function loaded() {
  const adapter = new MockViewerAdapter(document.createElement('div'));
  await adapter.loadModels([{ urn: 'urn-a' }]);
  return adapter;
}

describe('PropertyPicker', () => {
  it('lists discovered properties, marks chosen ones and toggles', async () => {
    const adapter = await loaded();
    const seen: string[][] = [];
    render(<Harness adapter={adapter} seen={seen} />);
    const level = await screen.findByRole('checkbox', { name: 'Level' });
    expect(level).not.toBeChecked();
    fireEvent.click(level);
    expect(seen.at(-1)).toEqual(['Name', 'Level']);
    expect(screen.getByRole('checkbox', { name: 'Level' })).toBeChecked();
    expect(
      screen.getByRole('list', { name: 'Chosen properties' }),
    ).toHaveTextContent('Level');
    adapter.destroy();
  });

  it('filters by search and keeps the last property', async () => {
    const adapter = await loaded();
    render(<Harness adapter={adapter} seen={[]} />);
    await screen.findByRole('checkbox', { name: 'Level' });
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'zzz-nothing' },
    });
    expect(screen.getByText('No properties match.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Name' })).toBeDisabled();
    adapter.destroy();
  });

  it('asks for a model when there is none', () => {
    render(<Harness adapter={null} seen={[]} />);
    expect(screen.getByText('No model loaded')).toBeInTheDocument();
  });
});
