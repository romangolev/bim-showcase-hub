import { useState } from 'react';
import type { ModalDefinition } from '../modal/types.js';
import { MAX_NAME_LENGTH } from '../store/savedStore.js';
import { usePublishedAdapter } from '../viewer/activeAdapterStore.js';
import {
  deleteViewpoint,
  goToViewpoint,
  moveViewpoint,
  nextViewpointName,
  renameViewpoint,
  saveViewpoint,
  useViewpoints,
  VIEWPOINT_MESSAGES,
} from '../viewer/viewpoints.js';

export const VIEWPOINTS_MODAL_ID = 'viewpoints';

export function ViewpointsBody() {
  const adapter = usePublishedAdapter();
  const points = useViewpoints();
  const [name, setName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const save = () => {
    if (!adapter) return;
    const result = saveViewpoint(
      name.trim() || nextViewpointName(),
      adapter.getState(),
    );
    if (result === 'ok') {
      setName('');
      setProblem(null);
    } else setProblem(VIEWPOINT_MESSAGES[result]);
  };

  const go = async (id: string) => {
    if (!adapter) return;
    const outcome = await goToViewpoint(adapter, id);
    setProblem(outcome.result === 'ok' ? null : outcome.text);
  };

  return (
    <div className="bsh-summary-settings">
      <div className="bsh-presets">
        <input
          type="text"
          className="bsh-input"
          aria-label="Viewpoint name"
          placeholder="Name this view"
          maxLength={MAX_NAME_LENGTH}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') save();
          }}
        />
        <button
          type="button"
          className="bsh-button"
          disabled={!adapter}
          onClick={save}
        >
          Save viewpoint
        </button>
      </div>
      {problem ? (
        <p role="alert" className="settings__hint">
          {problem}
        </p>
      ) : null}
      {points.length === 0 ? (
        <p className="settings__hint">No viewpoints yet.</p>
      ) : (
        <ul className="settings__palette">
          {points.map((point, index) => (
            <li key={`${point.id}:${point.name}`} className="bsh-presets">
              <input
                type="text"
                className="bsh-input"
                aria-label={`Rename ${point.name}`}
                maxLength={MAX_NAME_LENGTH}
                defaultValue={point.name}
                onBlur={(event) =>
                  renameViewpoint(point.id, event.target.value)
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
              />
              <button
                type="button"
                className="bsh-button"
                aria-label={`Go to ${point.name}`}
                disabled={!adapter}
                onClick={() => void go(point.id)}
              >
                Go to
              </button>
              <button
                type="button"
                className="bsh-button"
                aria-label={`Move ${point.name} up`}
                disabled={index === 0}
                onClick={() => moveViewpoint(point.id, -1)}
              >
                Up
              </button>
              <button
                type="button"
                className="bsh-button"
                aria-label={`Move ${point.name} down`}
                disabled={index === points.length - 1}
                onClick={() => moveViewpoint(point.id, 1)}
              >
                Down
              </button>
              <button
                type="button"
                className="bsh-button"
                aria-label={`Delete ${point.name}`}
                onClick={() => deleteViewpoint(point.id)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const VIEWPOINTS_MODAL: ModalDefinition = {
  id: VIEWPOINTS_MODAL_ID,
  title: 'Viewpoints',
  size: 'md',
  Body: ViewpointsBody,
};
