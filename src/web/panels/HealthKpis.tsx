import { Icon } from '../components/icons.js';
import { formatCount } from '../extensions/exportCommon.js';
import {
  DEFAULT_HEALTH_KPI_OPTIONS,
  type HealthKpiOptions,
  type HealthKpiTile,
  sanitizeHealthKpiOptions,
} from '../extensions/healthKpis.js';
import { defineRecord } from '../storage.js';
import './panels.css';

export const HEALTH_KPI_SETTINGS = defineRecord<HealthKpiOptions>({
  key: 'bsh.pane.dashboard.health.v1',
  initial: DEFAULT_HEALTH_KPI_OPTIONS,
  sanitize: sanitizeHealthKpiOptions,
});

const TONE_ICONS = {
  good: 'check',
  bad: 'alert',
} as const;

export interface HealthKpisProps {
  tiles: readonly HealthKpiTile[];
  onSelect: (tile: HealthKpiTile) => void;
}

function percentOf(share: number): string {
  return `${Math.round(share * 100)}%`;
}

export function HealthKpis({ tiles, onSelect }: HealthKpisProps) {
  if (tiles.length === 0) return null;
  return (
    <section className="bsh-kpis" aria-label="Model health">
      <h3 className="bsh-kpis__title">Model health</h3>
      <ul className="bsh-kpis__list">
        {tiles.map((tile) => {
          const elements = tile.id === 'elements';
          const shown = elements
            ? formatCount(tile.value)
            : percentOf(tile.share);
          const detail = elements
            ? tile.text
            : `${formatCount(tile.value)} · ${tile.text}`;
          const body = (
            <>
              <span className="bsh-kpi__label">
                {tile.tone !== 'neutral' ? (
                  <Icon
                    name={TONE_ICONS[tile.tone]}
                    size={14}
                    className="bsh-kpi__icon"
                  />
                ) : null}
                {tile.label}
              </span>
              <span className="bsh-kpi__value">{shown}</span>
              <span className="bsh-kpi__detail">{detail}</span>
            </>
          );
          return (
            <li key={tile.id} className="bsh-kpis__item">
              {tile.offenders.length > 0 ? (
                <button
                  type="button"
                  className="bsh-kpi"
                  data-tone={tile.tone}
                  aria-label={`${tile.label}: ${shown}. ${detail}`}
                  onClick={() => onSelect(tile)}
                >
                  {body}
                </button>
              ) : (
                <div className="bsh-kpi" data-tone={tile.tone}>
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
