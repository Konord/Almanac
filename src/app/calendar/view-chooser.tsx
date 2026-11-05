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
      <span className="w-full text-xl font-bold text-ink">This screen shows</span>
      {options.map((option) => {
        const active = (current?.id ?? "") === option.id;
        return (
          <form key={option.id || "all"} action={chooseView}>
            <input type="hidden" name="viewId" value={option.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="returnPath" value={returnPath} />
            <button
              aria-pressed={active}
              className={`min-h-[var(--touch-target)] rounded-2xl px-5 text-lg font-bold ${
                active ? "bg-ink text-board" : "bg-rail text-ink hover:bg-panel"
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
