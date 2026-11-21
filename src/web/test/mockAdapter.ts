import { MockViewerAdapter } from '../viewer/MockViewerAdapter.js';

export async function loadedMockAdapter(): Promise<MockViewerAdapter> {
  const host = document.createElement('div');
  document.body.append(host);
  const adapter = new MockViewerAdapter(host);
  await adapter.load('urn:mock-a', 'A');
  return adapter;
}
