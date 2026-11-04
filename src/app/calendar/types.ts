export type Layer = {
  id: string;
  name: string;
  colour: string;
  owner_member_id: string | null;
  counts_toward_busyness: boolean;
  visibility: string;
};

export type Member = { id: string; name: string };

export type CalendarEvent = {
  id: string;
  title: string;
  layer_id: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  member_id: string | null;
  energy_cost: number;
  visibility: string;
  notes: string | null;
};
