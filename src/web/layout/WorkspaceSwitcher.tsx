import {
  type KeyboardEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../components/icons.js';
import { moveFocus, onEscape, usePopover } from '../components/usePopover.js';
import { ModalHost } from '../modal/ModalHost.js';
import { LOCKED_REASON } from './layoutApply.js';
import { useLayout } from './layoutContext.js';
import {
  cleanWorkspaceName,
  MAX_WORKSPACES,
  type Workspace,
  type WorkspaceApi,
} from './workspaces.js';
import './workspaces.css';

interface FormProps {
  close: () => void;
}

function NameForm({
  title,
  initial,
  submitLabel,
  onSubmit,
  guard,
  close,
}: FormProps & {
  guard?: (name: string) => { error?: string; confirm?: string } | null;
  title: string;
  initial: string;
  submitLabel: string;
  onSubmit: (name: string) => boolean;
}) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  return (
    <form
      className="workspaces__form"
      onSubmit={(event) => {
        event.preventDefault();
        const verdict = guard?.(name);
        if (verdict?.error) {
          setError(verdict.error);
          return;
        }
        if (verdict?.confirm && confirm !== name) {
          setConfirm(name);
          setError(verdict.confirm);
          return;
        }
        if (!onSubmit(name)) {
          setError('Enter a unique name.');
          return;
        }
        close();
      }}
    >
      <label className="settings__field">
        {title}
        <input
          ref={inputRef}
          type="text"
          aria-label="Workspace name"
          maxLength={40}
          autoComplete="off"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
            setConfirm(null);
          }}
        />
      </label>
      {error ? (
        <p className="settings__hint" role="alert">
          {error}
        </p>
      ) : null}
      <div className="settings__actions">
        <button className="btn btn-primary" type="submit">
          {confirm === name ? 'Replace workspace' : submitLabel}
        </button>
        <button className="btn" type="button" onClick={close}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function ImportForm({
  workspace,
  close,
}: FormProps & { workspace: WorkspaceApi }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setText(await file.text());
    setError(null);
  };
  return (
    <form
      className="workspaces__form"
      onSubmit={(event) => {
        event.preventDefault();
        const message = workspace.importText(text);
        if (message) setError(message);
      }}
    >
      <label className="settings__field">
        Workspace JSON
        <textarea
          aria-label="Workspace JSON"
          rows={7}
          spellCheck={false}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setError(null);
          }}
        />
      </label>
      <label className="settings__field">
        Open a file
        <input
          type="file"
          accept=".json,application/json"
          aria-label="Import a workspace file"
          onChange={(event) => {
            void readFile(event.target.files?.[0]);
          }}
        />
      </label>
      <fieldset
        className="workspaces__drop"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void readFile(event.dataTransfer.files[0]);
        }}
      >
        <legend className="visually-hidden">Drop a workspace file</legend>
        Or drop a workspace JSON file here
      </fieldset>
      {error ? (
        <p className="settings__hint" role="alert">
          {error}
        </p>
      ) : null}
      <div className="settings__actions">
        <button
          className="btn btn-primary"
          type="submit"
          disabled={!text.trim()}
        >
          Apply layout
        </button>
        <button className="btn" type="button" onClick={close}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function WorkspaceSwitcher() {
  const layout = useLayout();
  const workspace = layout.workspaces;
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();
  const locked = layout.locked;

  const position = usePopover({
    open,
    triggerRef,
    popoverRef,
    onDismiss: () => setOpen(false),
  });

  useLayoutEffect(() => {
    if (open) {
      popoverRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    }
  }, [open]);

  if (layout.mode !== 'dock') return null;

  const close = (restore: boolean) => {
    setOpen(false);
    if (restore) triggerRef.current?.focus();
  };

  const run = (action: () => void) => {
    close(true);
    action();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (onEscape(event, () => close(true))) return;
    const buttons = Array.from(
      popoverRef.current?.querySelectorAll<HTMLButtonElement>(
        'button:not(:disabled)',
      ) ?? [],
    );
    if (buttons.length === 0) return;
    moveFocus(event, buttons);
  };

  const lockReason = locked ? LOCKED_REASON : undefined;
  const dialog = workspace.dialog;
  const renaming =
    dialog?.kind === 'rename'
      ? workspace.items.find((item) => item.id === dialog.id)
      : undefined;

  const savedRow = (item: Workspace) => (
    <li key={item.id} className="workspaces__row">
      <button
        type="button"
        className="workspaces__main"
        data-workspace={item.id}
        aria-label={`Apply ${item.name}`}
        aria-pressed={workspace.active === item.id}
        disabled={locked}
        title={lockReason ?? `Apply ${item.name}`}
        onClick={() => run(() => workspace.applySaved(item.id))}
      >
        <span className="workspaces__title">{item.name}</span>
      </button>
      <span className="workspaces__actions">
        <button
          type="button"
          className="workspaces__action"
          aria-label={`Rename ${item.name}`}
          disabled={locked}
          onClick={() =>
            run(() => workspace.openDialog({ kind: 'rename', id: item.id }))
          }
        >
          Rename
        </button>
        <button
          type="button"
          className="workspaces__action"
          aria-label={`Delete ${item.name}`}
          disabled={locked}
          onClick={() => workspace.remove(item.id)}
        >
          Delete
        </button>
      </span>
    </li>
  );

  return (
    <div className="menu">
      <button
        ref={triggerRef}
        type="button"
        className="icon-button"
        aria-label="Workspaces"
        title="Workspaces"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        onClick={() => (open ? close(false) : setOpen(true))}
        onKeyDown={(event) => {
          if (open) return;
          if (event.key === 'ArrowDown' || event.key === 'Enter') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <Icon name="layers" size={18} />
      </button>
      {open
        ? createPortal(
            <div
              ref={popoverRef}
              id={popoverId}
              className="workspaces"
              role="dialog"
              aria-label="Workspaces"
              style={
                position
                  ? { top: position.top, left: position.left }
                  : { top: 0, left: 0, visibility: 'hidden' }
              }
              onKeyDown={onKeyDown}
            >
              <section aria-label="Built-in workspaces">
                <h3 className="workspaces__heading">Built in</h3>
                <ul className="workspaces__rows">
                  {workspace.presets.map((preset) => {
                    const disabled =
                      locked ||
                      (preset.id === 'present' && !workspace.canPresent);
                    const reason = locked
                      ? lockReason
                      : preset.id === 'present' && !workspace.canPresent
                        ? 'Open a model first'
                        : undefined;
                    return (
                      <li key={preset.id} className="workspaces__row">
                        <button
                          type="button"
                          className="workspaces__main"
                          data-preset={preset.id}
                          aria-describedby={`${popoverId}-${preset.id}`}
                          aria-pressed={
                            workspace.active === `preset:${preset.id}`
                          }
                          disabled={disabled}
                          title={reason ?? `Apply ${preset.name}`}
                          onClick={() =>
                            run(() => workspace.applyPreset(preset.id))
                          }
                        >
                          <span className="workspaces__title">
                            {preset.name}
                          </span>
                          <span
                            id={`${popoverId}-${preset.id}`}
                            className="workspaces__description"
                          >
                            {reason ?? preset.description}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
              <section aria-label="Saved workspaces">
                <h3 className="workspaces__heading">Saved</h3>
                {workspace.items.length === 0 ? (
                  <p className="workspaces__empty">
                    Save the current arrangement to reuse it later.
                  </p>
                ) : (
                  <ul className="workspaces__rows">
                    {workspace.items.map(savedRow)}
                  </ul>
                )}
              </section>
              <div className="workspaces__footer">
                <button
                  type="button"
                  className="workspaces__command"
                  onClick={() =>
                    run(() => workspace.openDialog({ kind: 'save' }))
                  }
                >
                  Save current as…
                </button>
                <button
                  type="button"
                  className="workspaces__command"
                  disabled={locked}
                  title={lockReason}
                  onClick={() =>
                    run(() => workspace.openDialog({ kind: 'import' }))
                  }
                >
                  Import layout…
                </button>
                <button
                  type="button"
                  className="workspaces__command"
                  onClick={() => run(workspace.download)}
                >
                  Download layout
                </button>
                <button
                  type="button"
                  className="workspaces__command"
                  onClick={() => run(workspace.copyJson)}
                >
                  Copy layout JSON
                </button>
                <button
                  type="button"
                  className="workspaces__command"
                  onClick={() => run(workspace.copyLink)}
                >
                  Copy share link
                </button>
                {workspace.canRevert ? (
                  <button
                    type="button"
                    className="workspaces__command"
                    disabled={locked}
                    title={lockReason}
                    onClick={() => run(workspace.revert)}
                  >
                    Revert layout
                  </button>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
      {dialog?.kind === 'save' ? (
        <ModalHost
          definition={{
            id: 'workspace-save',
            title: 'Save workspace',
            size: 'sm',
            Body: ({ close: done }) => (
              <NameForm
                title="Name"
                initial=""
                submitLabel="Save workspace"
                close={done}
                guard={(name) => {
                  const clean = cleanWorkspaceName(name);
                  if (!clean) return null;
                  const same = workspace.items.find(
                    (item) => item.name.toLowerCase() === clean.toLowerCase(),
                  );
                  if (same) {
                    return {
                      confirm: `${same.name} already exists. Save again to replace it.`,
                    };
                  }
                  if (workspace.items.length >= MAX_WORKSPACES) {
                    return {
                      error: `You can keep ${MAX_WORKSPACES} workspaces. Delete one first.`,
                    };
                  }
                  return null;
                }}
                onSubmit={(name) => workspace.save(name) !== null}
              />
            ),
          }}
          onClose={workspace.closeDialog}
        />
      ) : null}
      {dialog?.kind === 'rename' && renaming ? (
        <ModalHost
          definition={{
            id: 'workspace-rename',
            title: 'Rename workspace',
            size: 'sm',
            Body: ({ close: done }) => (
              <NameForm
                title="Name"
                initial={renaming.name}
                submitLabel="Rename"
                close={done}
                onSubmit={(name) => workspace.rename(renaming.id, name)}
              />
            ),
          }}
          onClose={workspace.closeDialog}
        />
      ) : null}
      {dialog?.kind === 'import' ? (
        <ModalHost
          definition={{
            id: 'workspace-import',
            title: 'Import layout',
            size: 'md',
            Body: ({ close: done }) => (
              <ImportForm workspace={workspace} close={done} />
            ),
          }}
          onClose={workspace.closeDialog}
        />
      ) : null}
    </div>
  );
}
