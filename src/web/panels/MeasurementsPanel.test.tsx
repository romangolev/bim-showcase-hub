import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifications } from '../tasks/notifications.js';
import { act, fireEvent, render, screen, waitFor } from '../test/render.js';
import { createMockViewerAdapter } from '../viewer/MockViewerAdapter.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { MeasurementsPanel } from './MeasurementsPanel.js';

const loaded: ViewerAdapter[] = [];
let currentHost: HTMLElement | null = null;

async function load(): Promise<ViewerAdapter> {
  const host = document.createElement('div');
  document.body.append(host);
  const adapter = await createMockViewerAdapter(host);
  await adapter.load('dXJuOmFkc2s');
  loaded.push(adapter);
  currentHost = host;
  return adapter;
}

describe('MeasurementsPanel', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    for (const adapter of loaded.splice(0)) adapter.destroy();
    currentHost?.remove();
    currentHost = null;
    notifications.clear();
  });

  it('measures, lists and clears', async () => {
    const adapter = await load();
    render(<MeasurementsPanel adapter={adapter} />);
    expect(screen.getByText(/not saved with the tab/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Distance' }));
    expect(await screen.findByText('3.50 m')).toBeInTheDocument();
    expect(screen.getByText('distance')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(screen.queryByText('3.50 m')).toBeNull());
  });

  it('re-reads the list when the viewer reports a new measurement', async () => {
    const adapter = await load();
    render(<MeasurementsPanel adapter={adapter} />);
    await act(async () => {
      await adapter.startMeasure('area');
    });
    expect(await screen.findByText('12.25 m²')).toBeInTheDocument();
  });

  it('says when the viewer has no Measure tool', async () => {
    const adapter = await load();
    vi.spyOn(adapter, 'startMeasure').mockResolvedValue(false);
    render(<MeasurementsPanel adapter={adapter} />);
    fireEvent.click(screen.getByRole('button', { name: 'Angle' }));
    expect(
      await screen.findByText(
        'The Measure tool is not available in this viewer.',
      ),
    ).toBeInTheDocument();
  });

  it('copies the list as CSV and says so', async () => {
    const adapter = await load();
    render(<MeasurementsPanel adapter={adapter} />);
    fireEvent.click(screen.getByRole('button', { name: 'Distance' }));
    await screen.findByText('3.50 m');
    fireEvent.click(screen.getByRole('button', { name: 'Copy CSV' }));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'Type,Value\r\ndistance,3.50 m',
      ),
    );
    expect(
      notifications.getSnapshot().items.map((item) => item.message),
    ).toContain('Measurements copied');
  });

  it('reads the viewer again on Refresh', async () => {
    const adapter = await load();
    render(<MeasurementsPanel adapter={adapter} />);
    vi.spyOn(adapter, 'listMeasurements').mockReturnValue([
      { id: '9', type: 'angle', value: '45°' },
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText('45°')).toBeInTheDocument();
  });

  it('asks for a model when there is no viewer', () => {
    render(<MeasurementsPanel adapter={null} />);
    expect(screen.getByText(/Open a model/)).toBeInTheDocument();
  });
});
