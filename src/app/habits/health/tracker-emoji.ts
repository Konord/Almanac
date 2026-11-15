import { eventEmoji } from "@/lib/emoji";
import type { HealthTracker } from "../health-data";

/** A tracker's picture: its own, or one from its name, or one for its kind. */
export const trackerEmoji = (t: Pick<HealthTracker, "icon" | "kind" | "name">) =>
  t.icon || eventEmoji(null, t.name, t.kind === "medicine" ? "💊" : t.kind === "number" ? "🌡" : "🤒");
