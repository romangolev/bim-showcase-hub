import { MAX_SET_MEMBERS } from '../../store/modelSets.js';
import type { OpenMode, OpenPreview } from '../../viewer/openModels.js';
import type { AddTarget } from './DocumentTree.js';
import type { PickedModel } from './treeState.js';

export type PreviewOpen = (
  models: readonly PickedModel[],
  mode: OpenMode,
) => OpenPreview;

function pickLabel(model: PickedModel): string {
  return model.context.file ?? model.urn;
}

export function PickBar({
  picked,
  pickPreview,
  addTarget,
  onOpenTabs,
  onOpenTogether,
  onSaveSet,
  onExportIfc,
  onClear,
}: {
  picked: PickedModel[];
  pickPreview: PreviewOpen;
  addTarget: AddTarget | null;
  onOpenTabs?: (models: PickedModel[]) => void;
  onOpenTogether: (models: PickedModel[]) => void;
  onSaveSet: () => void;
  onExportIfc?: (models: PickedModel[]) => boolean | undefined;
  onClear: () => void;
}) {
  const tabs = pickPreview(picked, 'tabs');
  const together = pickPreview(picked, 'together');
  const message = tabs.blocked
    ? tabs.notice
    : together.blocked
      ? together.notice
      : null;
  const addable = addTarget
    ? picked.filter((model) => addTarget.canAdd(model.urn))
    : [];
  return (
    <section
      className="doc-tree__picks"
      data-empty={picked.length === 0}
      aria-label="Selected versions"
    >
      <span className="doc-tree__picks-count" aria-live="polite">
        {picked.length === 0
          ? 'Ctrl or Cmd click, Shift click or Space selects versions to open'
          : `${picked.length} selected`}
      </span>
      {picked.length > 0 ? (
        <>
          {onOpenTabs ? (
            <button
              type="button"
              className="btn doc-tree__pick-action"
              disabled={tabs.blocked}
              title={picked.map(pickLabel).join('\n')}
              onClick={() => onOpenTabs(picked)}
            >
              Open {picked.length} in viewer
            </button>
          ) : null}
          <button
            type="button"
            className="btn doc-tree__pick-action"
            disabled={picked.length < 2 || together.blocked}
            title={picked.map(pickLabel).join('\n')}
            onClick={() => onOpenTogether(picked)}
          >
            Open together
          </button>
          <button
            type="button"
            className="btn doc-tree__pick-action"
            disabled={picked.length > MAX_SET_MEMBERS}
            title={
              picked.length > MAX_SET_MEMBERS
                ? `A model set holds up to ${MAX_SET_MEMBERS} models`
                : picked.map(pickLabel).join('\n')
            }
            onClick={onSaveSet}
          >
            Save as model set
          </button>
          {onExportIfc ? (
            <button
              type="button"
              className="btn doc-tree__pick-action"
              title={picked.map(pickLabel).join('\n')}
              onClick={() => onExportIfc(picked)}
            >
              Export IFC
            </button>
          ) : null}
          {addTarget ? (
            <button
              type="button"
              className="btn doc-tree__pick-action"
              disabled={addable.length === 0}
              onClick={() => {
                addTarget.onAdd(addable);
                onClear();
              }}
            >
              Add to {addTarget.label}
            </button>
          ) : null}
          <button
            type="button"
            className="btn doc-tree__pick-action"
            onClick={onClear}
          >
            Clear
          </button>
          {message ? (
            <span className="doc-tree__picks-limit" role="alert">
              {message}
            </span>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
