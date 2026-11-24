import type { PickedModel } from './treeState.js';

export function IfcBatchBubble({
  picked,
  onExport,
  onCancel,
}: {
  picked: PickedModel[];
  onExport: (models: PickedModel[]) => void;
  onCancel: () => void;
}) {
  return (
    <section className="doc-tree__bubble" aria-label="Batch IFC export">
      <p className="doc-tree__bubble-title">Export models to IFC</p>
      <p className="doc-tree__bubble-text">
        Tick the models you want to export. Each one becomes an .ifc file in a
        single ZIP.
      </p>
      <div className="doc-tree__bubble-actions">
        <span className="doc-tree__picks-count" aria-live="polite">
          {picked.length === 0
            ? 'Nothing selected'
            : `${picked.length} selected`}
        </span>
        <button
          type="button"
          className="btn btn-primary"
          disabled={picked.length === 0}
          onClick={() => onExport(picked)}
        >
          Export IFC
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  );
}
