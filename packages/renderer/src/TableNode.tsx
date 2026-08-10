import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { TableColor } from '@dbml-canvas/core';
import { DetailsCard } from './DetailsCard.js';
import { TableColorSettings } from './TableColorSettings.js';
import type { TableFlowNode } from './graph.js';
import {
  makeFkHandleId,
  type FkHandleSide,
} from './fk-routing.js';
import type { ColumnDetails, TableDetails } from './schema-details.js';

type ActiveDetail = { kind: 'table' } | { kind: 'column'; columnId: string };
type PopoverSide = 'left' | 'right';

const OPEN_DELAY_MS = 200;
const CLOSE_DELAY_MS = 120;

function columnHandles(
  columnId: string,
  side: FkHandleSide,
  position: Position,
) {
  return (['source', 'target'] as const).map((role) => (
    <Handle
      key={`${role}:${side}`}
      id={makeFkHandleId(role, side, columnId)}
      type={role}
      position={position}
      className={`dbml-column-handle is-${side} is-${role}`}
      isConnectable={false}
    />
  ));
}

export function TableNode({ data, selected }: NodeProps<TableFlowNode>) {
  const {
    table,
    details,
    layout,
    onAnnotationChange,
    onEditNote,
    activeFkColumnId,
    relatedFkColumnIds = [],
    onFkColumnFocus,
  } = data;
  const relatedFkColumns = new Set(relatedFkColumnIds);
  const [activeDetail, setActiveDetail] = useState<ActiveDetail>();
  const [popoverSide, setPopoverSide] = useState<PopoverSide>('right');
  const [pinned, setPinned] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const openTimer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);
  const suppressTableDetail = useRef(false);

  useEffect(() => () => {
    if (openTimer.current) window.clearTimeout(openTimer.current);
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
  }, []);

  const currentDetail = resolveDetail(details, activeDetail);

  const clearOpenTimer = () => {
    if (openTimer.current) window.clearTimeout(openTimer.current);
    openTimer.current = undefined;
  };

  const clearCloseTimer = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = undefined;
  };

  const open = (next: ActiveDetail, element: HTMLElement, delayed: boolean) => {
    clearCloseTimer();
    clearOpenTimer();
    if (!canOpenDetail(next, suppressTableDetail.current)) return;
    const show = () => {
      if (!canOpenDetail(next, suppressTableDetail.current)) return;
      const bounds = element.getBoundingClientRect();
      setPopoverSide(window.innerWidth - bounds.right >= 360 ? 'right' : 'left');
      setSettingsOpen(false);
      setEditing(false);
      setSaveError(undefined);
      setActiveDetail(next);
    };
    if (delayed) openTimer.current = window.setTimeout(show, OPEN_DELAY_MS);
    else show();
  };

  const scheduleClose = () => {
    clearOpenTimer();
    if (pinned) return;
    clearCloseTimer();
    closeTimer.current = window.setTimeout(() => setActiveDetail(undefined), CLOSE_DELAY_MS);
  };

  const keepOpen = () => clearCloseTimer();

  const editNote = () => {
    if (!currentDetail) return;
    setDraft(currentDetail.note ?? '');
    setSaveError(undefined);
    setPinned(true);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setPinned(false);
    setSaveError(undefined);
  };

  const saveNote = async () => {
    if (!currentDetail?.noteTarget || !onEditNote) return;
    setSaving(true);
    setSaveError(undefined);
    try {
      await onEditNote(currentDetail.noteTarget, draft);
      setEditing(false);
      setPinned(false);
      setActiveDetail(undefined);
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  const chooseColor = (color: TableColor | null) => {
    clearOpenTimer();
    onAnnotationChange?.({ color });
    setSettingsOpen(false);
  };

  const toggleSettings = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    clearOpenTimer();
    clearCloseTimer();
    suppressTableDetail.current = true;
    setActiveDetail(undefined);
    setPinned(false);
    setEditing(false);
    setSettingsOpen((openState) => !openState);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape') return;
    if (!settingsOpen && !editing && !pinned && !activeDetail) return;
    event.stopPropagation();
    setSettingsOpen(false);
    setEditing(false);
    setPinned(false);
    setActiveDetail(undefined);
  };

  const handleBlur = (event: FocusEvent<HTMLElement>) => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    scheduleClose();
  };

  const detailPopover = currentDetail ? (
    <div
      className={`dbml-detail-popover is-${popoverSide} nodrag nopan nowheel`}
      onMouseEnter={keepOpen}
      onMouseLeave={scheduleClose}
      onFocus={keepOpen}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <DetailsCard
        detail={currentDetail}
        mode={editing ? 'edit' : 'view'}
        draft={draft}
        saving={saving}
        {...(saveError ? { error: saveError } : {})}
        {...(currentDetail.noteTarget && onEditNote ? { onEdit: editNote } : {})}
        onDraftChange={setDraft}
        onSave={() => { void saveNote(); }}
        onCancel={cancelEdit}
      />
    </div>
  ) : null;

  return (
    <article
      className={`dbml-table-node${selected ? ' is-selected' : ''}`}
      data-table-color={layout.color}
      style={!layout.color && table.headerColor
        ? { '--dbml-header-color': table.headerColor } as CSSProperties
        : undefined}
      onKeyDown={handleKeyDown}
      onMouseLeave={() => {
        suppressTableDetail.current = false;
        scheduleClose();
      }}
    >
      <header
        className="dbml-table-header"
        tabIndex={0}
        onMouseEnter={(event) => open({ kind: 'table' }, event.currentTarget, true)}
        onMouseLeave={scheduleClose}
        onFocus={(event) => {
          if (isDirectFocusTarget(event.target, event.currentTarget)) {
            open({ kind: 'table' }, event.currentTarget, false);
          }
        }}
        onBlur={handleBlur}
      >
        <span className="dbml-table-name">{table.displayName}</span>
        <span className="dbml-table-header-actions">
          <span className="dbml-column-count">{table.columns.length}</span>
          <button
            type="button"
            className="dbml-settings-toggle nodrag nopan nowheel"
            aria-label={`Table options for ${table.displayName}`}
            aria-expanded={settingsOpen}
            onMouseEnter={clearOpenTimer}
            onClick={toggleSettings}
          >
            ⋮
          </button>
        </span>
        {activeDetail?.kind === 'table' ? detailPopover : null}
        {settingsOpen ? (
          <div
            className={`dbml-settings-popover is-${popoverSide} nodrag nopan nowheel`}
            onMouseEnter={clearOpenTimer}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            <TableColorSettings
              {...(layout.color ? { color: layout.color } : {})}
              onChange={chooseColor}
            />
          </div>
        ) : null}
      </header>

      <div className="dbml-column-list">
        {table.columns.map((column) => {
          const columnDetails = details.columns[column.id];
          const activeFk = activeFkColumnId === column.id;
          const relatedFk = !activeFk && relatedFkColumns.has(column.id);
          return (
            <div
              className={`dbml-column-row${activeFk
                ? ' is-fk-active'
                : relatedFk ? ' is-fk-related' : ''}`}
              key={column.id}
              tabIndex={0}
              {...(onFkColumnFocus
                ? { 'aria-label': `Focus FK relationships for ${table.displayName}.${column.name}` }
                : {})}
              onClick={(event) => {
                event.stopPropagation();
                onFkColumnFocus?.(column.id);
              }}
              onKeyDown={(event) => {
                if (!isFkFocusActivationKey(event.key)) return;
                event.preventDefault();
                event.stopPropagation();
                onFkColumnFocus?.(column.id);
              }}
              onMouseEnter={(event) => open(
                { kind: 'column', columnId: column.id },
                event.currentTarget,
                true,
              )}
              onMouseLeave={scheduleClose}
              onFocus={(event) => {
                if (isDirectFocusTarget(event.target, event.currentTarget)) {
                  open(
                    { kind: 'column', columnId: column.id },
                    event.currentTarget,
                    false,
                  );
                }
              }}
              onBlur={handleBlur}
            >
              {columnHandles(column.id, 'left', Position.Left)}

              <span className="dbml-column-flags" aria-label="Column constraints">
                {columnDetails?.compactLabels.map((label) => <strong key={label}>{label}</strong>)}
              </span>
              <span className="dbml-column-name">{column.name}</span>
              <span className="dbml-column-type">{column.type}</span>
              <span className="dbml-column-nullability">{column.nullable ? 'NULL' : 'NN'}</span>

              {columnHandles(column.id, 'right', Position.Right)}
              {activeDetail?.kind === 'column' && activeDetail.columnId === column.id
                ? detailPopover
                : null}
            </div>
          );
        })}
      </div>
    </article>
  );
}

export function isDirectFocusTarget(target: EventTarget, currentTarget: EventTarget): boolean {
  return target === currentTarget;
}

export function canOpenDetail(detail: ActiveDetail, tableDetailSuppressed: boolean): boolean {
  return detail.kind !== 'table' || !tableDetailSuppressed;
}

export function isFkFocusActivationKey(key: string): boolean {
  return key === 'Enter' || key === ' ';
}

function resolveDetail(
  tableDetails: TableDetails,
  activeDetail: ActiveDetail | undefined,
): TableDetails | ColumnDetails | undefined {
  if (!activeDetail) return undefined;
  return activeDetail.kind === 'table'
    ? tableDetails
    : tableDetails.columns[activeDetail.columnId];
}
