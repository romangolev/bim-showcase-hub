import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveBlob } from '../extensions/download.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { fireEvent, render, screen, within } from '../test/render.js';
import { ActivityPane } from './ActivityPane.js';
import { createNotificationStore } from './notifications.js';

vi.mock('../extensions/download.js', () => ({ saveBlob: vi.fn() }));

describe('ActivityPane', () => {
  beforeEach(() => {
    installMemoryStorage();
    vi.mocked(saveBlob).mockClear();
  });

  it('lists the newest entry first with its tone and downloads the log', () => {
    const store = createNotificationStore();
    store.record('Opened A.rvt', { tone: 'info' });
    store.record('Export failed', { tone: 'error', detail: 'Sheet 1' });
    render(<ActivityPane store={store} />);
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    const [first, second] = rows;
    if (!first || !second) throw new Error('expected two activity rows');
    expect(first).toHaveTextContent('Export failed');
    expect(within(first).getByText('Error')).toBeInTheDocument();
    expect(second).toHaveTextContent('Opened A.rvt');
    fireEvent.click(screen.getByRole('button', { name: 'Download log' }));
    expect(saveBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      expect.stringMatching(/^bsh-activity-.+\.json$/),
    );
  });

  it('clears the log and shows the empty state', () => {
    const store = createNotificationStore();
    store.record('Script error', { tone: 'error' });
    render(<ActivityPane store={store} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear log' }));
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getByText('No activity yet')).toBeInTheDocument();
  });
});
