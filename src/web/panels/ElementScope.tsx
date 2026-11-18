import { useId } from 'react';
import { ELEMENT_SCOPES, type ElementScope } from '../viewer/propertyScope.js';

export const ELEMENT_SCOPE_LABELS: Record<ElementScope, string> = {
  all: 'All elements',
  selected: 'Selected',
  visible: 'Visible',
  isolated: 'Isolated',
};

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
  return (
    <div className="bsh-field bsh-scope">
      <label htmlFor={id} className="bsh-sr-only">
        {label}
      </label>
      <select
        id={id}
        className="bsh-select"
        value={value}
        onChange={(event) =>
          onChange(
            ELEMENT_SCOPES.find((s) => s === event.target.value) ?? 'all',
          )
        }
      >
        {ELEMENT_SCOPES.map((scope) => (
          <option key={scope} value={scope}>
            {ELEMENT_SCOPE_LABELS[scope]}
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
  const name = ELEMENT_SCOPE_LABELS[state.elements].toLowerCase();
  if (state.pending) return `Reading ${name} elements`;
  return `Summarizing ${state.rows.length.toLocaleString('en-US')} ${name} of ${state.total.toLocaleString('en-US')} elements`;
}
