// The calendar key: Done / Missed swatches + the today-ring marker.
export function CalLegend() {
  return (
    <div className="hist__legend">
      <span>
        <i style={{ background: 'var(--success-soft)' }} /> Done
      </span>
      <span>
        <i style={{ background: 'var(--miss-soft)' }} /> Missed
      </span>
      <span>
        <i className="is-today" /> Today
      </span>
    </div>
  );
}
