export interface ResizeScheduler {
  schedule: (settleMs: number) => void;
  cancel: () => void;
}

export function createResizeScheduler(run: () => void): ResizeScheduler {
  let pending = false;
  let frame = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    schedule: (settleMs) => {
      clearTimeout(timer);
      timer = setTimeout(run, settleMs);
      if (pending) return;
      pending = true;
      frame = requestAnimationFrame(() => {
        pending = false;
        run();
      });
    },
    cancel: () => {
      if (pending) cancelAnimationFrame(frame);
      pending = false;
      clearTimeout(timer);
    },
  };
}
