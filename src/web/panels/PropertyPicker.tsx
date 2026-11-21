import { useId, useMemo, useState } from 'react';
import { Icon } from '../components/icons.js';
import { StateBlock } from '../components/StateBlock.js';
import { announce } from '../tasks/notifications.js';
import { groupCatalog } from '../viewer/propertyCatalog.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { usePropertyCatalog } from './usePropertyCatalog.js';
import './panels.css';

export interface PropertyPickerProps {
  adapter: ViewerAdapter | null;
  value: readonly string[];
  onChange: (names: readonly string[]) => void;
  minimum?: number;
}

const GROUP_CAP = 100;

export function PropertyPicker({
  adapter,
  value,
  onChange,
  minimum = 1,
}: PropertyPickerProps) {
  const searchId = useId();
  const [query, setQuery] = useState('');
  const state = usePropertyCatalog(adapter);
  const groups = useMemo(
    () => groupCatalog(state.catalog, query),
    [state.catalog, query],
  );
  const chosen = new Set(value);
  const locked = (name: string) => chosen.has(name) && value.length <= minimum;
  const toggle = (name: string) =>
    onChange(
      chosen.has(name) ? value.filter((v) => v !== name) : [...value, name],
    );
  const move = (name: string, delta: -1 | 1) => {
    const from = value.indexOf(name);
    const to = from + delta;
    const destination = value[to];
    if (from < 0 || destination === undefined) return;
    const next = [...value];
    next[from] = destination;
    next[to] = name;
    onChange(next);
    announce(`Moved ${name} to position ${to + 1} of ${value.length}`);
  };

  return (
    <div className="bsh-picker">
      <ul className="bsh-picker__chosen" aria-label="Chosen properties">
        {value.map((name, index) => (
          <li key={name} className="bsh-badge">
            {name}
            <span className="bsh-picker__arrange">
              <button
                type="button"
                className="inline-action"
                disabled={index === 0}
                aria-label={`Move ${name} up`}
                onClick={() => move(name, -1)}
              >
                <Icon name="arrowUp" size={14} />
              </button>
              <button
                type="button"
                className="inline-action"
                disabled={index === value.length - 1}
                aria-label={`Move ${name} down`}
                onClick={() => move(name, 1)}
              >
                <Icon name="arrowDown" size={14} />
              </button>
            </span>
            <button
              type="button"
              className="inline-action bsh-picker__remove"
              disabled={locked(name)}
              aria-label={`Remove ${name}`}
              onClick={() => toggle(name)}
            >
              <Icon name="close" size={12} />
            </button>
          </li>
        ))}
      </ul>
      <label htmlFor={searchId} className="bsh-sr-only">
        Search properties
      </label>
      <input
        id={searchId}
        type="search"
        className="bsh-input"
        placeholder="Search properties"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {!adapter && (
        <StateBlock
          variant="empty"
          compact
          title="No model loaded"
          message="Open a model to discover its properties."
        />
      )}
      {adapter && state.status === 'loading' && (
        <>
          <StateBlock
            variant="loading"
            compact
            message={
              state.progress
                ? `Discovering properties, ${state.progress.loaded} of ${state.progress.total} elements`
                : 'Discovering properties'
            }
            rows={3}
          />
          <button type="button" className="btn" onClick={state.cancel}>
            Cancel
          </button>
        </>
      )}
      {state.status === 'cancelled' && (
        <StateBlock
          variant="empty"
          compact
          title="Discovery cancelled"
          message="The property list stopped before it finished."
          action={{ label: 'Retry', onClick: state.reload }}
        />
      )}
      {state.status === 'error' && (
        <StateBlock
          variant="error"
          compact
          message="We could not list this model's properties."
          detail={state.message}
          action={{ label: 'Retry', onClick: state.reload }}
        />
      )}
      {state.status === 'ready' && groups.length === 0 && (
        <p role="status" className="bsh-picker__none">
          No properties match.
        </p>
      )}
      <div className="bsh-picker__groups">
        {groups.map((group) => {
          const visible = group.properties.filter(
            (info, index) => index < GROUP_CAP || chosen.has(info.name),
          );
          const hidden = group.properties.length - visible.length;
          return (
            <fieldset key={group.category} className="bsh-fieldset">
              <legend>{group.category}</legend>
              {visible.map((info) => (
                <label
                  key={`${info.category}\u0000${info.name}`}
                  className="settings__check"
                >
                  <input
                    type="checkbox"
                    checked={chosen.has(info.name)}
                    disabled={locked(info.name)}
                    onChange={() => toggle(info.name)}
                  />
                  {info.name}
                </label>
              ))}
              {hidden > 0 && (
                <p className="bsh-picker__none">
                  {hidden} more, refine the search
                </p>
              )}
            </fieldset>
          );
        })}
      </div>
    </div>
  );
}
