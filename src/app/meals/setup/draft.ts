/** What the Meal times screen keeps until its one Save. */
export type MealTimeDraft = { id: string; name: string; icon: string | null; usual: string; onPlanner: boolean };
export type MealSetupDraft = {
  times: MealTimeDraft[];
  /** "weekday|mealTimeId" → category id (no entry: no preset). */
  presets: Record<string, string>;
};
