import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setStorageAdapter } from '../storage.js';
import { memoryAdapter } from '../storageAdapter.js';
import { fireEvent, render, screen, waitFor } from '../test/render.js';
import { createMockViewerAdapter } from '../viewer/MockViewerAdapter.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { viewPrefsFor } from '../viewer/views.js';
import { ViewsPanel } from './ViewsPanel.js';

const hosts: HTMLElement[] = [];
const adapters: ViewerAdapter[] = [];

async function loaded(sources: string[]): Promise<ViewerAdapter> {
  const host = document.createElement('div');
  document.body.append(host);
  hosts.push(host);
  const adapter = await createMockViewerAdapter(host);
  adapters.push(adapter);
  await adapter.loadModels(sources.map((urn) => ({ urn })));
  return adapter;
}

beforeEach(() => {
  setStorageAdapter(memoryAdapter());
});

afterEach(() => {
  for (const adapter of adapters.splice(0)) adapter.destroy();
  for (const host of hosts.splice(0)) host.remove();
});

function open(view: string) {
  fireEvent.click(screen.getByRole('button', { name: `Open ${view}` }));
}

describe('ViewsPanel', () => {
  it('lists the 3D view and the sheets of the loaded model', async () => {
    const adapter = await loaded(['dXJuOmFkc2s']);
    render(<ViewsPanel adapter={adapter} />);
    expect(
      screen.getByRole('heading', { name: 'Sheets and views' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('{3D}')).toBeInTheDocument();
    expect(screen.getByText('A101 - Plans')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open {3D}' })).toBeDisabled();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('moves a favorite above the dimension groups', async () => {
    const adapter = await loaded(['dXJuOmFkc2s']);
    render(<ViewsPanel adapter={adapter} />);
    await screen.findByText('A101 - Plans');
    expect(screen.queryByRole('heading', { name: 'Favorites' })).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Favorite A101 - Plans' }),
    );
    expect(
      screen.getByRole('heading', { name: 'Favorites' }),
    ).toBeInTheDocument();
    expect(viewPrefsFor('dXJuOmFkc2s').favorites).toEqual(['mock-a101']);
    expect(screen.queryByRole('heading', { name: 'Sheets' })).toBeNull();
  });

  it('warns before switching and then reloads with the view', async () => {
    const adapter = await loaded(['dXJuOmFkc2s']);
    render(<ViewsPanel adapter={adapter} />);
    await screen.findByText('A101 - Plans');
    open('A101 - Plans');
    expect(screen.getByText(/Switching resets/)).toBeInTheDocument();
    expect(adapter.getModels()[0]?.view).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Switch view' }));
    await waitFor(() => expect(adapter.getModels()[0]?.view).toBe('mock-a101'));
    expect(screen.queryByText(/Switching resets/)).toBeNull();
    expect(
      await screen.findByRole('button', { name: 'Open {3D}' }),
    ).not.toBeDisabled();
  });

  it('hides a view behind a count and restores it', async () => {
    const adapter = await loaded(['dXJuOmFkc2s']);
    render(<ViewsPanel adapter={adapter} />);
    await screen.findByText('{3D}');
    fireEvent.click(screen.getByRole('button', { name: 'Hide {3D}' }));
    await waitFor(() => expect(screen.queryByText('{3D}')).toBeNull());
    expect(viewPrefsFor('dXJuOmFkc2s').hidden).toEqual(['mock-3d']);
    fireEvent.click(screen.getByRole('button', { name: 'Show hidden (1)' }));
    expect(screen.getByText('{3D}')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show {3D}' }));
    expect(screen.getByText('{3D}')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Show hidden/ })).toBeNull(),
    );
    expect(viewPrefsFor('dXJuOmFkc2s').hidden).toEqual([]);
  });

  it('sets and clears the start view', async () => {
    const adapter = await loaded(['dXJuOmFkc2s']);
    render(<ViewsPanel adapter={adapter} />);
    await screen.findByText('A101 - Plans');
    fireEvent.click(
      screen.getByRole('button', { name: 'Set as start view A101 - Plans' }),
    );
    expect(viewPrefsFor('dXJuOmFkc2s').start).toBe('mock-a101');
    fireEvent.click(
      screen.getByRole('button', { name: 'Clear start view A101 - Plans' }),
    );
    expect(viewPrefsFor('dXJuOmFkc2s').start).toBeUndefined();
  });

  it('lets a combined tab pick a model and refuses another dimension', async () => {
    const adapter = await loaded(['aaa', 'bbb']);
    render(<ViewsPanel adapter={adapter} />);
    const select = await screen.findByRole('combobox', { name: 'Model' });
    expect(
      screen.getAllByRole('option').map((option) => option.textContent),
    ).toEqual(['Model 1', 'Model 2']);
    fireEvent.change(select, { target: { value: 'bbb' } });
    expect(select).toHaveValue('bbb');
    await screen.findByText('A101 - Plans');
    open('A101 - Plans');
    fireEvent.click(screen.getByRole('button', { name: 'Switch view' }));
    expect(
      await screen.findByText(/only show views of the same dimension/),
    ).toBeInTheDocument();
    expect(adapter.getModels()).toHaveLength(2);
  });

  it('says so when no model is loaded', () => {
    render(<ViewsPanel adapter={null} />);
    expect(screen.getByText('No model loaded')).toBeInTheDocument();
  });
});
