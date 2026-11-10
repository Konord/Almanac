import { Suspense } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Plus, Trash } from "@phosphor-icons/react/dist/ssr";
import { AppFrame, Button, Card, Emoji, Field, Input, Select, firstParam } from "@/components/ui";
import { EmojiPicker } from "@/components/emoji-picker";
import { requireHousehold } from "@/lib/household";
import { addMealTime, moveMealTime, removeMealTime, savePresets, updateMealTime } from "../actions";
import { loadMealBasics, loadPresets } from "../data";
import { MealsHeader, Pager, linker, pageOf } from "../parts";

/**
 * Meals setup: the meal times (rows on the planner) and presets (Tuesday
 * dinner is Tacos). Things bought every so often are repeating groceries,
 * set on the grocery list itself.
 */
export default function MealsSetupPage(props: PageProps<"/meals/setup">) {
  return (
    <AppFrame section="meals">
      <Suspense fallback={<p className="text-lg text-ink-muted">Loading…</p>}>
        <Setup searchParams={props.searchParams} />
      </Suspense>
    </AppFrame>
  );
}

const TABS = [
  { tab: "times", label: "Meal times" },
  { tab: "presets", label: "Presets" },
] as const;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

async function Setup({ searchParams }: { searchParams: PageProps<"/meals/setup">["searchParams"] }) {
  const household = await requireHousehold();
  const params = await searchParams;
  const tabParam = firstParam(params.tab);
  const tab = TABS.find((t) => t.tab === tabParam)?.tab ?? "times";
  const page = Number(firstParam(params.page) ?? 0);
  const here = linker("/meals/setup", { tab: tab === "times" ? null : tab });
  const returnTo = here({ page: page || null });
  const basics = await loadMealBasics();

  return (
    <>
      <MealsHeader title="Meal times" tab="setup" error={firstParam(params.error)} message={firstParam(params.message)}>
        <nav aria-label="Setup" className="flex gap-1 rounded-2xl bg-panel p-1.25">
          {TABS.map((t) => (
            <Link
              key={t.tab}
              href={here({ tab: t.tab === "times" ? null : t.tab })}
              aria-current={t.tab === tab ? "page" : undefined}
              className={`flex min-h-[var(--touch-target)] items-center rounded-xl px-5 text-base font-bold ${t.tab === tab ? "bg-board text-ink shadow-[0_1px_3px_rgba(30,35,45,0.12)]" : "text-ink-muted"}`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </MealsHeader>

      {tab === "times" ? (
        <MealTimes basics={basics} page={page} here={here} returnTo={returnTo} />
      ) : (
        <Presets basics={basics} weekStartsOn={household.settings.weekStartsOn} returnTo={returnTo} />
      )}
    </>
  );
}

function MealTimes({ basics, page, here, returnTo }: { basics: Awaited<ReturnType<typeof loadMealBasics>>; page: number; here: ReturnType<typeof linker>; returnTo: string }) {
  const shown = pageOf(basics.mealTimes, page, 5);
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-5">
      <Card title="Meal times">
        <p className="mb-3 text-lg text-ink-muted">Each meal time is a row on the planner. The usual time is when it shows on Today.</p>
        <ul className="flex min-h-0 flex-1 flex-col gap-2.5">
          {shown.items.map((t, k) => {
            const i = shown.page * 5 + k;
            return (
              <li key={t.id} className="flex items-center gap-2 rounded-2xl bg-rail p-2.5">
                <form action={updateMealTime} className="flex min-w-0 flex-1 items-center gap-3">
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <input type="hidden" name="id" value={t.id} />
                  <EmojiPicker initial={t.icon ?? ""} nameField="name" fullScreen />
                  <Input name="name" defaultValue={t.name} aria-label="Name" maxLength={30} className="min-w-0 flex-1" />
                  <Input name="usualTime" type="time" defaultValue={t.usual_time} aria-label="Usual time" className="w-40" />
                  <label className="flex items-center gap-2 text-lg text-ink">
                    <input type="checkbox" name="showOnPlanner" defaultChecked={t.show_on_planner} className="size-6 accent-[var(--color-ink)]" />
                    On planner
                  </label>
                  <Button variant="secondary">Save</Button>
                </form>
                {(["up", "down"] as const).map((direction) => (
                  <form key={direction} action={moveMealTime}>
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="direction" value={direction} />
                    <button
                      aria-label={direction === "up" ? "Move up" : "Move down"}
                      disabled={direction === "up" ? i === 0 : i === basics.mealTimes.length - 1}
                      className="flex size-[var(--touch-target)] items-center justify-center rounded-full bg-board text-ink disabled:opacity-30"
                    >
                      {direction === "up" ? <ArrowUp size="1.375rem" weight="bold" aria-hidden /> : <ArrowDown size="1.375rem" weight="bold" aria-hidden />}
                    </button>
                  </form>
                ))}
                <form action={removeMealTime}>
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="name" value={t.name} />
                  <button aria-label={`Remove ${t.name}`} className="flex size-[var(--touch-target)] items-center justify-center rounded-full text-danger hover:bg-board">
                    <Trash size="1.375rem" aria-hidden />
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
        <Pager page={shown.page} pages={shown.pages} href={(n) => here({ page: n || null })} />
      </Card>
      <Card title="Add a meal time">
        <form action={addMealTime} className="mt-2 flex flex-col gap-4">
          <input type="hidden" name="returnTo" value={returnTo} />
          <div className="flex items-end gap-3">
            <EmojiPicker nameField="name" fullScreen />
            <Field label="Name">
              <Input name="name" placeholder="Breakfast" maxLength={30} required />
            </Field>
          </div>
          <Field label="Usual time">
            <Input name="usualTime" type="time" defaultValue="07:30" className="w-40" />
          </Field>
          <Button className="self-start">
            <Plus size="1.25rem" weight="bold" aria-hidden />
            Add
          </Button>
        </form>
        <p className="mt-4 text-lg text-ink-muted">
          Removing a meal time also removes the meals planned in it. To split a meal for different people (like a work lunch), add it to the same
          meal time and choose who it&apos;s for.
        </p>
      </Card>
    </div>
  );
}

async function Presets({ basics, weekStartsOn, returnTo }: { basics: Awaited<ReturnType<typeof loadMealBasics>>; weekStartsOn: 0 | 1; returnTo: string }) {
  const presets = await loadPresets();
  const times = basics.mealTimes.filter((t) => t.show_on_planner).slice(0, 5);
  const days = Array.from({ length: 7 }, (_, i) => (i + weekStartsOn) % 7);
  const chosen = (weekday: number, timeId: string) => presets.find((p) => p.weekday === weekday && p.meal_time_id === timeId)?.category_id ?? "";
  return (
    <Card title="Presets">
      <p className="mb-3 text-lg text-ink-muted">
        A preset puts a category on the planner by itself each week (Tuesday dinner is Tacos). You just choose which tacos. Weeks you&apos;ve already opened keep what they have, plus any new presets.
      </p>
      <form action={savePresets} className="flex min-h-0 flex-1 flex-col gap-4">
        <input type="hidden" name="returnTo" value={returnTo} />
        <div className="grid gap-2.5" style={{ gridTemplateColumns: "9rem repeat(7, minmax(0, 1fr))" }}>
          <span />
          {days.map((d) => (
            <span key={d} className="text-center text-xl font-bold text-ink">
              {WEEKDAYS[d]}
            </span>
          ))}
          {times.map((t) => (
            <div key={t.id} className="contents">
              <span className="flex items-center gap-2 text-xl font-bold text-ink">
                <Emoji emoji={t.icon} className="size-9" />
                {t.name}
              </span>
              {days.map((d) => (
                <Select key={d} name={`preset|${d}|${t.id}`} defaultValue={chosen(d, t.id)} aria-label={`${WEEKDAYS[d]} ${t.name}`} className="min-w-0 px-2 text-base">
                  <option value="">—</option>
                  {basics.categories
                    .filter((c) => c.active && (c.meal_time_ids.length === 0 || c.meal_time_ids.includes(t.id)))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.icon} {c.name}
                      </option>
                    ))}
                </Select>
              ))}
            </div>
          ))}
        </div>
        <Button className="self-start">Save presets</Button>
      </form>
    </Card>
  );
}

