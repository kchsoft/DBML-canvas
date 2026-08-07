import { TABLE_COLORS, type TableColor } from '@dbml-canvas/core';

export interface TableColorSettingsProps {
  color?: TableColor;
  onChange: (color: TableColor | null) => void;
}

export function TableColorSettings({ color: selectedColor, onChange }: TableColorSettingsProps) {
  return (
    <section className="dbml-color-settings" aria-label="Table color settings">
      <h3>Table color</h3>
      <div className="dbml-color-options" role="group" aria-label="Table color">
        {TABLE_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            className={`dbml-color-swatch is-${color}${selectedColor === color ? ' is-active' : ''}`}
            aria-label={`Use ${color} table color`}
            aria-pressed={selectedColor === color}
            onClick={() => onChange(color)}
          />
        ))}
        <button
          type="button"
          className="dbml-color-reset"
          aria-label="Reset table color"
          title="Reset table color"
          onClick={() => onChange(null)}
        >
          ×
        </button>
      </div>
    </section>
  );
}
