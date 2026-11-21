import { type NotificationStore, notifications } from './notifications.js';

export function installErrorCapture(
  target: Window = window,
  store: NotificationStore = notifications,
): () => void {
  const onError = (event: ErrorEvent) =>
    store.record(event.message || 'Script error', {
      tone: 'error',
      ...(event.filename
        ? { detail: `${event.filename}:${event.lineno}` }
        : {}),
    });
  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    store.record(reason instanceof Error ? reason.message : String(reason), {
      tone: 'error',
    });
  };
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
  };
}
