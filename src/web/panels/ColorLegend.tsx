import { type Coloring, entryItems, legendCsv } from '../extensions/colorBy.js';
import { saveBlob } from '../extensions/download.js';
import { runElementAction } from '../extensions/elementActions.js';
import { formatCount } from '../extensions/exportCommon.js';
import { Button } from '../ui/Button.js';
import { Checkbox } from '../ui/Checkbox.js';
import {
  clearColoring,
  toggleColoringGroup,
  useHiddenGroups,
} from '../viewer/modelColoring.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { hexColor } from './colorsSettings.js';

export interface ColorLegendProps {
  adapter: ViewerAdapter;
  coloring: Coloring;
  onOverride?: (key: string, hex: string) => void;
}

export function ColorLegend({
  adapter,
  coloring,
  onOverride,
}: ColorLegendProps) {
  const hidden = useHiddenGroups(adapter);
  return (
    <div className="bsh-color-legend">
      {coloring.note ? (
        <p className="bsh-summary__notice">{coloring.note}</p>
      ) : null}
      <ul
        className="bsh-color-legend__list"
        aria-label={`Legend for ${coloring.title}`}
      >
        {coloring.legend.map((entry, index) => (
          <li key={entry.key} className="bsh-color-legend__row">
            {onOverride ? (
              <input
                type="color"
                className="bsh-color-legend__swatch"
                aria-label={`Colour for ${entry.label}`}
                value={hexColor(entry.color)}
                onChange={(event) => onOverride(entry.key, event.target.value)}
              />
            ) : (
              <span
                className="bsh-legend__swatch"
                style={{ background: entry.color }}
                aria-hidden="true"
              />
            )}
            <span className="bsh-color-legend__label" title={entry.label}>
              {entry.label}
            </span>
            <span className="bsh-color-legend__count">
              {formatCount(entry.count)}
            </span>
            <Checkbox
              aria-label={`Show ${entry.label}`}
              checked={!hidden.has(entry.key)}
              onChange={() => toggleColoringGroup(adapter, entry.key)}
            />
            <Button
              aria-label={`Isolate ${entry.label}`}
              onClick={() =>
                runElementAction(
                  adapter,
                  'isolate',
                  entryItems(coloring, index),
                )
              }
            >
              Isolate
            </Button>
          </li>
        ))}
      </ul>
      <div className="bsh-color-legend__actions">
        <Button onClick={() => clearColoring(adapter)}>Clear colours</Button>
        <Button
          onClick={() =>
            saveBlob(
              new Blob([legendCsv(coloring)], {
                type: 'text/csv;charset=utf-8',
              }),
              `${coloring.title}-legend.csv`,
            )
          }
        >
          Download legend (CSV)
        </Button>
      </div>
    </div>
  );
}
