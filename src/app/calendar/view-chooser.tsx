import { chooseView } from "./actions";
import type { SavedView } from "./types";

/**
 * A row of buttons for picking which saved view this screen shows.
 * The choice is remembered on this device only.
 */
export function ViewChooser({
  views,
  current,
  returnTo,
  returnPath,
}: {
  views: SavedView[];
  current: SavedView | null;
  returnTo: string;
  returnPath: "/" | "/calendar";
}) {
  if (views.length === 0) return null;
  const options = [{ id: "", name: "Everything" }, ...views];
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Which layers this screen shows">
      <span className="text-base text-ink-muted">Showing:</span>
      {options.map((option) => {
        const active = (current?.id ?? "") === option.id;
        return (
          <form key={option.id || "all"} action={chooseView}>
            <input type="hidden" name="viewId" value={option.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="returnPath" value={returnPath} />
            <button
              aria-pressed={active}
              className={`min-h-[var(--touch-target)] rounded-full border-2 px-4 text-base ${
                active ? "border-marker-blue bg-marker-blue text-board" : "border-frame bg-board text-ink"
              }`}
            >
              {option.name}
            </button>
          </form>
        );
      })}
    </div>
  );
}
