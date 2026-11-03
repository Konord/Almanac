export const VISIBILITY_OPTIONS = [
  { value: "everyone", label: "Everyone" },
  { value: "adults", label: "Adults only" },
  { value: "just_me", label: "Just me" },
] as const;

export type Visibility = (typeof VISIBILITY_OPTIONS)[number]["value"];

export function isVisibility(value: string): value is Visibility {
  return VISIBILITY_OPTIONS.some((v) => v.value === value);
}

export const ENERGY_OPTIONS = [
  { value: 0, label: "None" },
  { value: 1, label: "Light" },
  { value: 2, label: "Medium" },
  { value: 3, label: "Heavy" },
] as const;
