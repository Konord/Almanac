import { test } from "node:test";
import assert from "node:assert/strict";
import { draftProblem, type SettingsDraft } from "./draft.ts";

const base: SettingsDraft = {
  name: "Home",
  timeZone: "America/Toronto",
  currency: "CAD",
  weekStartsOn: 0,
  monthStyle: "rolling",
  units: "metric",
  temperatureUnit: "celsius",
  measures: "canadian",
  handwriting: true,
  reviewWeekday: 6,
  reviewTime: "09:00",
  panelBoxes: ["today", "bucket"],
  members: [{ id: "a", name: "Jess", role: "parent", colour: "blue", icon: null, birthYear: null, hasPin: false, pin: "", pinAgain: "", removed: false }],
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
