import { useId, useState } from 'react';
import type { Vec3 } from '../../shared/combined.js';
import { nudgeOffset, resetOffset, snapToAnchor } from '../viewer/alignment.js';
import { formatKm, type ModelInfo, metersPerUnit } from '../viewer/modelSet.js';
import type { PlacementInfo } from '../viewer/placement.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';

export const VISUAL_ONLY_NOTE =
  'Visual only. The files and their coordinates do not change.';

export const ALIGNMENT_STEPS = [0.1, 1, 10] as const;

const AXES = [
  { axis: 0, name: 'X' },
  { axis: 1, name: 'Y' },
  { axis: 2, name: 'Z' },
] as const;

function stepLabel(meters: number): string {
  return `${meters} m`;
}

function sharedLabel(value: boolean | null): string {
  if (value === null) return 'unknown';
  return value ? 'yes' : 'no';
}

function distanceLabel(distanceMeters: number | null): string {
  if (distanceMeters === null) return 'unknown';
  return `${formatKm(distanceMeters)} km`;
}

export interface ModelAlignmentProps {
  adapter: ViewerAdapter | null;
  model: ModelInfo;
  info: PlacementInfo | null;
  anchorName: string | null;
  offsets?: Readonly<Record<string, Vec3>> | null;
  onOffsetsChange?: (next: Record<string, Vec3> | null) => void;
}

export function ModelAlignment({
  adapter,
  model,
  info,
  anchorName,
  offsets,
  onOffsetsChange,
}: ModelAlignmentProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<number>(1);
  const bodyId = useId();
  const noteId = useId();
  const anchor = info?.anchor === true;
  const unitMeters = metersPerUnit(info?.unit ?? null);
  const disabled = !onOffsetsChange;
  const change = (next: Record<string, Vec3> | null) => {
    if (!onOffsetsChange) return;
    adapter?.setModelOffsets(next);
    onOffsetsChange(next);
  };
  return (
    <div className="bsh-models__alignment">
      <button
        type="button"
        className="bsh-button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((current) => !current)}
      >
        Alignment for {model.name}
      </button>
      {open ? (
        <div id={bodyId} className="bsh-models__alignment-body">
          <p id={noteId} className="settings__hint">
            {VISUAL_ONLY_NOTE}
          </p>
          <p className="settings__hint">Unit: {info?.unit ?? 'unknown'}</p>
          <p className="settings__hint">
            Shared coordinates: {sharedLabel(info?.sharedCoordinates ?? null)}
          </p>
          <p className="settings__hint">
            {anchor
              ? 'Anchor'
              : `Distance from ${anchorName ?? 'the anchor'}: ${distanceLabel(info?.distanceMeters ?? null)}`}
          </p>
          {anchor ? null : (
            <>
              <div className="bsh-models__tools">
                {ALIGNMENT_STEPS.map((meters) => (
                  <button
                    key={meters}
                    type="button"
                    className="bsh-button"
                    aria-pressed={step === meters}
                    aria-describedby={noteId}
                    onClick={() => setStep(meters)}
                  >
                    {stepLabel(meters)}
                  </button>
                ))}
              </div>
              <div className="bsh-models__tools">
                {AXES.map(({ axis, name }) => (
                  <span key={name} className="bsh-models__tools">
                    <button
                      type="button"
                      className="bsh-button"
                      aria-label={`Move -${name} ${stepLabel(step)}`}
                      aria-describedby={noteId}
                      disabled={disabled}
                      onClick={() =>
                        change(
                          nudgeOffset(
                            offsets,
                            model.id,
                            axis,
                            -step,
                            unitMeters,
                          ),
                        )
                      }
                    >
                      -{name}
                    </button>
                    <button
                      type="button"
                      className="bsh-button"
                      aria-label={`Move +${name} ${stepLabel(step)}`}
                      aria-describedby={noteId}
                      disabled={disabled}
                      onClick={() =>
                        change(
                          nudgeOffset(
                            offsets,
                            model.id,
                            axis,
                            step,
                            unitMeters,
                          ),
                        )
                      }
                    >
                      +{name}
                    </button>
                  </span>
                ))}
              </div>
              <div className="bsh-models__tools">
                <button
                  type="button"
                  className="bsh-button"
                  aria-describedby={noteId}
                  disabled={disabled || !adapter}
                  onClick={() => {
                    if (!adapter) return;
                    change(
                      snapToAnchor(
                        offsets,
                        model.id,
                        adapter.getTogetherOffsets(),
                      ),
                    );
                  }}
                >
                  Snap centre to anchor
                </button>
                <button
                  type="button"
                  className="bsh-button"
                  aria-describedby={noteId}
                  disabled={disabled}
                  onClick={() => change(resetOffset(offsets, model.id))}
                >
                  Reset
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
