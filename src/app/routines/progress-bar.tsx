/** A green bar showing how much of a routine is done. */
export function ProgressBar({ done, total }: { done: number; total: number }) {
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div
      className="h-3 overflow-hidden rounded-full bg-panel"
      role="progressbar"
      aria-valuenow={done}
      aria-valuemin={0}
      aria-valuemax={total}
    >
      <div className="h-full rounded-full bg-marker-green" style={{ width: `${percent}%` }} />
    </div>
  );
}
