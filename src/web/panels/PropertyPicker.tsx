import { useId, useMemo, useState } from 'react';
import { StateBlock } from '../components/StateBlock.js';
import { groupCatalog } from '../viewer/propertyCatalog.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { usePropertyCatalog } from './usePropertyCatalog.js';

export interface PropertyPickerProps {
  adapter: ViewerAdapter | null;
  value: readonly string[];
  onChange: (names: readonly string[]) => void;
  minimum?: number;
}

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

  return (
    <div className="bsh-picker">
      <ul className="bsh-picker__chosen" aria-label="Chosen properties">
        {value.map((name) => (
          <li key={name} className="bsh-badge">
            {name}
            <button
              type="button"
              className="bsh-picker__remove"
              disabled={locked(name)}
              aria-label={`Remove ${name}`}
              onClick={() => toggle(name)}
            >
              x
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
        <StateBlock
          variant="loading"
          compact
          message="Discovering properties"
          rows={3}
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
        {groups.map((group) => (
          <fieldset key={group.category} className="bsh-fieldset">
            <legend>{group.category}</legend>
            {group.properties.map((info) => (
              <label
                key={`${info.category}\u0000${info.name}`}
                className="bsh-field"
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
          </fieldset>
        ))}
      </div>
    </div>
  );
}
