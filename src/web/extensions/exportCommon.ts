import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';

export function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(value));
}

export function missingModels(adapter: ViewerAdapter): string[] {
  if (typeof adapter.getModels !== 'function') return [];
  return adapter
    .getModels()
    .filter((model) => model.status !== 'ready')
    .map((model) => model.name);
}

export function tick(): Promise<void> {
  if (typeof MessageChannel === 'undefined') {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      channel.port2.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
}

export function tooLargeReason(maxBytes: number): string {
  return `the file would be larger than ${Math.round(maxBytes / (1024 * 1024))} MB`;
}
