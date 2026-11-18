import { useId } from 'react';
import {
  type BaseElementScope,
  type ElementScope,
  sanitizeElementScope,
} from '../viewer/propertyScope.js';
import {
  getSet,
  setIdOf,
  useSelectionSets,
  withSetLabels,
} from '../viewer/selectionSets.js';

export const ELEMENT_SCOPE_LABELS: Record<BaseElementScope, string> = {
  all: 'All elements',
  selected: 'Selected',
  visible: 'Visible',
  isolated: 'Isolated',
};

export function scopeName(scope: ElementScope): string {
  const id = setIdOf(scope);
  if (id === undefined) return ELEMENT_SCOPE_LABELS[scope as BaseElementScope];
  return getSet(id)?.name ?? 'deleted set';
}

export function ElementScopeSelect({
  value,
  onChange,
  label = 'Summarize elements',
}: {
  value: ElementScope;
  onChange: (next: ElementScope) => void;
  label?: string;
}) {
  const id = useId();
  const labels = withSetLabels(ELEMENT_SCOPE_LABELS, value, useSelectionSets());
  return (
    <div className="bsh-field bsh-scope">
      <label htmlFor={id} className="bsh-sr-only">
        {label}
      </label>
      <select
        id={id}
        className="bsh-select"
        value={value}
        onChange={(event) => onChange(sanitizeElementScope(event.target.value))}
      >
        {Object.entries(labels).map(([scope, text]) => (
          <option key={scope} value={scope}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}

export function elementScopeLabel(state: {
  elements: ElementScope;
  rows: readonly unknown[];
  total: number;
  pending: boolean;
}): string {
  if (state.elements === 'all') return '';
  const name = scopeName(state.elements).toLowerCase();
  if (state.pending) return `Reading ${name} elements`;
  return `Summarizing ${state.rows.length.toLocaleString('en-US')} ${name} of ${state.total.toLocaleString('en-US')} elements`;
}
