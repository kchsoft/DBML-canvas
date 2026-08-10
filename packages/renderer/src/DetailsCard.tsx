import type { ColumnDetails, TableDetails } from './schema-details.js';

export interface DetailsCardProps {
  detail: TableDetails | ColumnDetails;
  mode: 'view' | 'edit';
  draft?: string;
  saving?: boolean;
  error?: string;
  onEdit?: () => void;
  onDraftChange?: (value: string) => void;
  onSave?: () => void;
  onCancel?: () => void;
}

export function DetailsCard({
  detail,
  mode,
  draft = '',
  saving = false,
  error,
  onEdit,
  onDraftChange,
  onSave,
  onCancel,
}: DetailsCardProps) {
  const isColumn = detail.kind === 'column';

  return (
    <section className="dbml-details-card" aria-label={`${detail.name} details`}>
      <header className="dbml-details-heading">
        <span className="dbml-details-kind" aria-hidden="true">{isColumn ? '◫' : '▤'}</span>
        <div>
          <h3>{detail.name}</h3>
          {isColumn ? <code>{detail.type}</code> : null}
        </div>
      </header>

      {isColumn && detail.fullConstraints.length > 0 ? (
        <div className="dbml-constraint-rail" aria-label="Constraints">
          {detail.fullConstraints.map((constraint) => (
            <span key={constraint}>{constraint}</span>
          ))}
        </div>
      ) : null}

      <section className="dbml-details-section">
        <div className="dbml-details-section-title">
          <h4>Note</h4>
          {mode === 'view' && onEdit ? (
            <button type="button" onClick={onEdit}>Edit note</button>
          ) : null}
        </div>
        {mode === 'edit' ? (
          <div className="dbml-note-form">
            <textarea
              aria-label={`Note for ${detail.name}`}
              autoFocus
              rows={5}
              value={draft}
              disabled={saving}
              onChange={(event) => onDraftChange?.(event.target.value)}
            />
            {error ? <p className="dbml-note-error" role="alert">{error}</p> : null}
            <div className="dbml-note-actions">
              <button type="button" disabled={saving} onClick={onCancel}>Cancel</button>
              <button type="button" disabled={saving} onClick={onSave}>
                {saving ? 'Saving…' : 'Save note'}
              </button>
            </div>
          </div>
        ) : (
          <p className={detail.note ? 'dbml-note-copy' : 'dbml-empty-detail'}>
            {detail.note ?? 'No note'}
          </p>
        )}
      </section>

      {isColumn && detail.defaultValue ? (
        <section className="dbml-details-section dbml-detail-pair">
          <h4>Default</h4>
          <code>{detail.defaultValue}</code>
        </section>
      ) : null}

      {isColumn && detail.enum && detail.enum.values.length > 0 ? (
        <section className="dbml-details-section">
          <h4>Allowed values</h4>
          <ul
            className="dbml-details-list dbml-enum-values"
            aria-label={`${detail.enum.name} values`}
            tabIndex={0}
          >
            {detail.enum.values.map((value) => (
              <li key={value.name}>
                <code>{value.name}</code>
                {value.note ? <span>{value.note}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {isColumn && detail.foreignKeys.length > 0 ? (
        <section className="dbml-details-section">
          <h4>References</h4>
          <ul className="dbml-details-list">
            {detail.foreignKeys.map((foreignKey) => (
              <li key={`${foreignKey.tableId}:${foreignKey.columnIds.join(',')}`}>
                <code>{foreignKey.tableName}.{foreignKey.columnNames.join(', ')}</code>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="dbml-details-section">
        <h4>Indexes</h4>
        {detail.indexes.length > 0 ? (
          <ul className="dbml-details-list dbml-index-list">
            {detail.indexes.map((index, indexPosition) => (
              <li key={`${index.name ?? 'index'}:${indexPosition}`}>
                <span>
                  {index.name ? <strong>{index.name}</strong> : null}
                  <code>({index.members.map((member) => member.value).join(', ')})</code>
                </span>
                {index.primaryKey ? <em>PRIMARY</em> : null}
                {index.unique ? <em>UNIQUE</em> : null}
              </li>
            ))}
          </ul>
        ) : <p className="dbml-empty-detail">No indexes</p>}
      </section>
    </section>
  );
}
