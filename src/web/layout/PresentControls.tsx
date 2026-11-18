import { useCallback, useEffect, useRef, useState } from 'react';
import { usePersisted } from '../storage.js';
import { usePublishedAdapter } from '../viewer/activeAdapterStore.js';
import { SNAPSHOT } from '../viewer/snapshot.js';
import { goToViewpoint, useViewpoints } from '../viewer/viewpoints.js';

const STEP_KEYS: Record<string, 1 | -1> = {
  ArrowRight: 1,
  ArrowLeft: -1,
  ' ': 1,
};

export interface PresentControlsProps {
  onExit: () => void;
}

export function PresentControls({ onExit }: PresentControlsProps) {
  const adapter = usePublishedAdapter();
  const points = useViewpoints();
  const [{ advanceSeconds }] = usePersisted(SNAPSHOT);
  const [index, setIndex] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const latest = useRef({ adapter, points, index });
  latest.current = { adapter, points, index };
  const count = points.length;

  const step = useCallback(async (delta: 1 | -1) => {
    const { adapter: viewer, points: list, index: at } = latest.current;
    if (!viewer || list.length === 0) return;
    const base = at ?? (delta > 0 ? -1 : 0);
    const next = (base + delta + list.length) % list.length;
    latest.current.index = next;
    setIndex(next);
    const point = list[next];
    if (!point) return;
    const outcome = await goToViewpoint(viewer, point.id);
    setNotice(outcome.result === 'ok' ? '' : outcome.text);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const delta = STEP_KEYS[event.key];
      if (!delta || event.defaultPrevented || event.altKey || event.metaKey)
        return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest(
          event.key === ' '
            ? 'input, textarea, select, button, a, [role="menu"]'
            : 'input, textarea, select, [role="menu"]',
        )
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      void step(delta);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [step]);

  useEffect(() => {
    if (advanceSeconds <= 0 || count < 2) return;
    const timer = setTimeout(() => void step(1), advanceSeconds * 1000);
    return () => clearTimeout(timer);
  }, [advanceSeconds, count, index, step]);

  const current = index === null ? null : Math.min(index, count - 1);
  const name = current === null ? undefined : points[current]?.name;
  const announcement =
    count === 0 || current === null
      ? ''
      : `Viewpoint ${current + 1} of ${count}: ${name}. ${notice}`.trim();

  return (
    <div className="present-bar">
      {count > 0 ? (
        <span className="present-position" title={name}>
          <span aria-hidden="true">
            {current === null ? '-' : current + 1} / {count}
          </span>
          <span className="visually-hidden" role="status" aria-live="polite">
            {announcement}
          </span>
        </span>
      ) : null}
      <button type="button" className="present-exit" onClick={onExit}>
        Exit presentation
      </button>
    </div>
  );
}
