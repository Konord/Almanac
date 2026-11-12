import { test } from "node:test";
import assert from "node:assert/strict";
import { draftProblem, type SettingsDraft } from "./draft.ts";
import { DEFAULT_SCREEN_SAVER } from "../../lib/screen-saver.ts";

const base: SettingsDraft = {
  name: "Home",
  timeZone: "America/Toronto",
  currency: "CAD",
  weekStartsOn: 0,
  monthStyle: "rolling",
  habitsView: "lines",
  units: "metric",
  temperatureUnit: "celsius",
  measures: "canadian",
  handwriting: true,
  reviewWeekday: 6,
  reviewTime: "09:00",
  panelBoxes: ["today", "bucket"],
  members: [{ id: "a", name: "Jess", role: "parent", colour: "blue", icon: null, birthYear: null, hasPin: false, pin: "", pinAgain: "", removed: false }],
  apps: [],
  screenSaver: DEFAULT_SCREEN_SAVER,
};

test("a good settings draft passes", () => assert.equal(draftProblem(base), null));
test("the household needs a name", () => assert.match(draftProblem({ ...base, name: " " }) ?? "", /name/));
test("the two PINs must match", () => {
  const m = { ...base.members[0], pin: "1234", pinAgain: "1235" };
  assert.match(draftProblem({ ...base, members: [m] }) ?? "", /don't match/);
});
test("people marked to go aren't checked", () => {
  const m = { ...base.members[0], name: "", removed: true };
  assert.equal(draftProblem({ ...base, members: [m] }), null);
});
test("apps are checked with the rest of the settings", () => {
  const app = { id: "new-1", name: "Jellyfin", icon: "🍿", colour: "purple", kind: "web" as const, address: "", localKey: "", checkUp: true, removed: false };
  assert.match(draftProblem({ ...base, apps: [app] }) ?? "", /web address/);
  assert.equal(draftProblem({ ...base, apps: [{ ...app, address: "192.168.2.10:8096" }] }), null);
});
