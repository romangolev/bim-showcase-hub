import {
  type ColumnDef,
  columnResizingFeature,
  columnSizingFeature,
  FlexRender,
  metaHelper,
  type Row,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { StateBlock } from '../components/StateBlock.js';
import { writeClipboard } from '../extensions/clipboard.js';
import type { ModelDbId } from '../viewer/modelSet.js';
import type {
  ElementProperties,
  ElementProperty,
} from '../viewer/propertyReads.js';
import { useModels } from '../viewer/useModels.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import {
  groupProperties,
  MAX_SELECTED,
  type PropertyGroup,
  valueText,
} from './propertiesView.js';
import { COLUMN_LIMITS, useColumnResize } from './useColumnResize.js';
import { useResolvedAdapter } from './useScopedRows.js';
import './panels.css';
import { Card, CardHeader, CardTitle } from '../ui/Card.js';
import { Input } from '../ui/Input.js';
import { Select, SelectOption } from '../ui/Select.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableResizeHandle,
  TableRow,
} from '../ui/Table.js';

export interface PropertiesPanelProps {
  adapter?: ViewerAdapter | null;
  title?: string;
  scope?: { value: string; onChange: (scope: string) => void };
}

type Read =
  | { key: string; status: 'loading' }
  | { key: string; status: 'ready'; elements: ElementProperties[] }
  | { key: string; status: 'error'; message: string };

interface PropertyLine {
  key: string;
  property: ElementProperty;
}

interface PropertyMeta {
  label: string;
  className: string;
}

const NO_ELEMENTS: ElementProperties[] = [];

const features = tableFeatures({
  columnMeta: metaHelper<PropertyMeta>(),
  columnSizingFeature,
  columnResizingFeature,
});

const PropertyRow = memo(function PropertyRow({
  row,
}: {
  row: Row<typeof features, PropertyLine>;
}) {
  return (
    <TableRow>
      {row.getAllCells().map((cell) => (
        <TableCell
          key={cell.id}
          className={cell.column.columnDef.meta?.className}
        >
          <FlexRender cell={cell} />
        </TableCell>
      ))}
    </TableRow>
  );
});

function PropertyGrid({
  group,
  label,
  onCopy,
}: {
  group: PropertyGroup;
  label: string;
  onCopy: (value: string) => void;
}) {
  const columns = useMemo<ColumnDef<typeof features, PropertyLine>[]>(
    () => [
      {
        id: 'property',
        header: 'Property',
        cell: ({ row }) => {
          const name = row.original.property.name;
          return <span>{name}</span>;
        },
        meta: { label: 'Property', className: 'bsh-props__key-cell' },
      },
      {
        id: 'value',
        header: 'Value',
        cell: ({ row }) => {
          const text = valueText(row.original.property.value);
          return (
            <span className="bsh-props__value-row">
              <span className="bsh-props__value">{text}</span>
              <button
                type="button"
                className="bsh-props__copy"
                aria-label={`Copy ${row.original.property.name}`}
                onClick={() => onCopy(text)}
              >
                Copy
              </button>
            </span>
          );
        },
        meta: { label: 'Value', className: 'bsh-props__value-cell' },
      },
    ],
    [onCopy],
  );
  const lines = useMemo(
    () =>
      group.items.map(
        (property, index): PropertyLine => ({
          key: `${index}\u0000${property.name}`,
          property,
        }),
      ),
    [group.items],
  );
  const table = useTable({
    features,
    columns,
    data: lines,
    getRowId: (line) => line.key,
    columnResizeMode: 'onChange',
    defaultColumn: COLUMN_LIMITS,
  });
  const { sized, tableStyle, headStyle, resizeProps } = useColumnResize(table);
  return (
    <Table
      className="bsh-table bsh-props__table"
      aria-label={label}
      fixed={sized}
      style={tableStyle}
    >
      <TableHeader>
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id}>
            {group.headers.map((header) => {
              const { column } = header;
              const meta = column.columnDef.meta;
              return (
                <TableHead
                  key={header.id}
                  className={meta?.className}
                  aria-label={meta?.label}
                  style={headStyle(header)}
                >
                  <table.FlexRender header={header} />
                  <TableResizeHandle
                    {...resizeProps(header, `Resize ${meta?.label} column`)}
                  />
                </TableHead>
              );
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <PropertyRow key={row.id} row={row} />
        ))}
      </TableBody>
    </Table>
  );
}

export function PropertiesPanel({
  adapter: override,
  title = 'Properties',
  scope,
}: PropertiesPanelProps) {
  const adapter = useResolvedAdapter(override);
  const models = useModels(adapter);
  const ready = models.filter((model) => model.status === 'ready');
  const model =
    ready.find((m) => m.id === scope?.value || m.urn === scope?.value) ??
    ready[0] ??
    null;
  const modelId = model?.id ?? null;
  const [selection, setSelection] = useState<ModelDbId[]>([]);
  const [filter, setFilter] = useState('');
  const [read, setRead] = useState<Read | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!adapter) {
      setSelection([]);
      return;
    }
    setSelection(adapter.getModelSelection());
    return adapter.onSelectionChange(setSelection);
  }, [adapter]);

  const ids = useMemo(
    () =>
      selection.filter((item) => item.modelId === modelId).map((i) => i.dbId),
    [selection, modelId],
  );
  const key = useMemo(
    () => `${modelId}|${ids.length}|${ids.slice(0, MAX_SELECTED).join(',')}`,
    [modelId, ids],
  );

  useEffect(() => {
    if (!adapter || !modelId || ids.length === 0) {
      setRead(null);
      return;
    }
    let live = true;
    setRead({ key, status: 'loading' });
    adapter
      .getElementsProperties(
        ids.slice(0, MAX_SELECTED).map((dbId) => ({ modelId, dbId })),
      )
      .then(
        (found) => {
          if (!live) return;
          setRead({
            key,
            status: 'ready',
            elements: found.filter(
              (element): element is ElementProperties => element !== null,
            ),
          });
        },
        (err: unknown) => {
          if (!live) return;
          setRead({
            key,
            status: 'error',
            message:
              err instanceof Error ? err.message : 'Could not read properties',
          });
        },
      );
    return () => {
      live = false;
    };
  }, [adapter, modelId, ids, key]);

  const copy = useCallback(async (value: string) => {
    setNotice(
      (await writeClipboard(value))
        ? 'Copied'
        : 'Could not copy to the clipboard',
    );
  }, []);

  const current = read?.key === key ? read : null;
  const elements = current?.status === 'ready' ? current.elements : NO_ELEMENTS;
  const sections = useMemo(
    () =>
      elements.map((element) => ({
        element,
        groups: groupProperties(element.properties, filter),
      })),
    [elements, filter],
  );
  const matches = sections.some((section) => section.groups.length > 0);

  return (
    <Card className="bsh-props" aria-label={title}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      {!model ? (
        <StateBlock
          variant="empty"
          title="No model loaded"
          message="Open a model to inspect its elements."
          compact
        />
      ) : (
        <>
          <div className="bsh-props__tools">
            {ready.length > 1 && (
              <Select
                className="bsh-select"
                aria-label="Model"
                value={model.id}
                onValueChange={(value) => scope?.onChange(value)}
              >
                {ready.map((m) => (
                  <SelectOption key={m.id} value={m.id}>
                    {m.name}
                  </SelectOption>
                ))}
              </Select>
            )}
            <Input
              type="search"
              aria-label="Filter properties"
              placeholder="Filter"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
            <span role="status" className="bsh-props__notice">
              {notice}
            </span>
          </div>
          {ids.length === 0 && (
            <StateBlock
              variant="empty"
              title="Select an element"
              message="Pick an element in the viewer to see its properties."
              compact
            />
          )}
          {current?.status === 'loading' && (
            <StateBlock variant="loading" message="Reading properties" />
          )}
          {current?.status === 'error' && (
            <StateBlock
              variant="error"
              message="We could not read this element's properties."
              detail={current.message}
              compact
            />
          )}
          {current?.status === 'ready' && !matches && (
            <StateBlock
              variant="empty"
              title={filter ? 'No matching properties' : 'No properties'}
              message={
                filter
                  ? 'Change the filter to see more.'
                  : 'This element has no readable properties.'
              }
              compact
            />
          )}
          <div className="bsh-props__body">
            {sections.map(({ element, groups }) =>
              groups.length === 0 ? null : (
                <div key={element.dbId} className="bsh-props__element">
                  {elements.length > 1 && (
                    <h3 className="bsh-props__name">{element.name}</h3>
                  )}
                  {groups.map((group) => (
                    <details key={group.category} open>
                      <summary className="bsh-props__category">
                        {group.category}
                      </summary>
                      <PropertyGrid
                        group={group}
                        label={
                          elements.length > 1
                            ? `${group.category} properties for ${element.name}`
                            : `${group.category} properties`
                        }
                        onCopy={copy}
                      />
                    </details>
                  ))}
                </div>
              ),
            )}
            {ids.length > MAX_SELECTED && (
              <p className="bsh-muted">
                {`${ids.length - MAX_SELECTED} more selected elements not shown`}
              </p>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
