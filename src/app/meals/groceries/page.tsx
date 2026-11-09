import { Suspense } from "react";
import Link from "next/link";
import { Broom, CaretLeft, CaretRight, Check, ListChecks, Plus, Sparkle } from "@phosphor-icons/react/dist/ssr";
import { AppFrame, Button, Card, Emoji, IconLink, Input, SoftLink, firstParam } from "@/components/ui";
import { requireHousehold } from "@/lib/household";
import { DEFAULT_AISLES, amountText, weekStartOf } from "@/lib/meals";
import { createClient } from "@/lib/supabase/server";
import { addDays, isLocalDate, localDateOf, zonedToUtc } from "@/lib/time";
import { addGrocery, buildGroceries, clearTicked, toggleGrocery } from "../actions";
import { MealsHeader, linker } from "../parts";
import { ReviewList, type ReviewLine } from "./review-list";

/**
 * Groceries. Almanac suggests what to buy for the week (the planned
 * meals' ingredients, the weekly buys, low backup parts); nothing goes on
 * the list until you approve it. The list is sorted by aisle.
 */
export default function GroceriesPage(props: PageProps<"/meals/groceries">) {
  return (
    <AppFrame section="meals">
      <Suspense fallback={<p className="text-lg text-ink-muted">Loading…</p>}>
        <Groceries searchParams={props.searchParams} />
      </Suspense>
    </AppFrame>
  );
}

type Line = {
  id: string;
  amount: number | null;
  unit: string | null;
  source: string;
  detail: string | null;
  status: string;
  checked: boolean;
  item: { name: string; icon: string | null; aisle: string };
};

async function Groceries({ searchParams }: { searchParams: PageProps<"/meals/groceries">["searchParams"] }) {
  const household = await requireHousehold();
  const params = await searchParams;
  const { timeZone, locale, weekStartsOn } = household.settings;
  const today = localDateOf(new Date(), timeZone);
  const thisWeek = weekStartOf(today, weekStartsOn);
  const weekParam = firstParam(params.week);
  const week = weekStartOf(weekParam && isLocalDate(weekParam) ? weekParam : thisWeek, weekStartsOn);
  const aisleParam = firstParam(params.aisle);
  const here = linker("/meals/groceries", { week: week === thisWeek ? null : week, aisle: aisleParam ?? null });
  const returnTo = here({});

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shopping_list")
    .select("id, amount, unit, source, detail, status, checked, items(name, icon, aisle)")
    .order("created_at");
  if (error) throw error;
  const lines: Line[] = (data ?? []).map(({ items, ...l }) => ({ ...l, amount: l.amount === null ? null : Number(l.amount), item: items as unknown as Line["item"] }));
  const suggested = lines.filter((l) => l.status === "suggested");
  const list = lines.filter((l) => l.status === "approved");

  const order = (a: string) => {
    const i = (DEFAULT_AISLES as readonly string[]).indexOf(a);
    return i < 0 ? 50 : i;
  };
  const aisles = [...new Set(list.map((l) => l.item.aisle))].sort((a, b) => order(a) - order(b) || a.localeCompare(b));
  const shownAisles = aisleParam && aisles.includes(aisleParam) ? [aisleParam] : aisles.slice(0, 8);
  const perAisle = shownAisles.length === 1 ? 30 : shownAisles.length <= 4 ? 10 : 4;
  const hiddenAisles = aisles.length - shownAisles.length;
  const ticked = list.filter((l) => l.checked).length;

  const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { timeZone, ...o }).format(zonedToUtc(d, "12:00", timeZone));
  const weekLabel = `Week of ${fmt(week, { month: "short", day: "numeric" })}`;

  return (
    <>
      <MealsHeader title="Grocery list" tab="groceries" error={firstParam(params.error)} message={firstParam(params.message)}>
        <div className="flex items-center gap-2">
          <IconLink href={here({ week: addDays(week, -7) })} label="Previous week" icon={CaretLeft} />
          <span className="min-w-40 text-center text-xl font-bold text-ink">{week === thisWeek ? "This week" : weekLabel}</span>
          <IconLink href={here({ week: addDays(week, 7) })} label="Next week" icon={CaretRight} />
        </div>
      </MealsHeader>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)] gap-5">
        <Card title={suggested.length ? `To check (${suggested.length})` : "Suggestions"} icon={Sparkle} tint="yellow">
          {suggested.length ? (
            <ReviewList
              week={week}
              returnTo={returnTo}
              lines={suggested.map(
                (l): ReviewLine => ({
                  id: l.id,
                  name: l.item.name,
                  icon: l.item.icon,
                  amount: amountText(l.amount, l.unit),
                  detail: l.detail,
                  source: l.source as ReviewLine["source"],
                }),
              )}
            />
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-xl text-ink-soft">
                Almanac looks at {week === thisWeek ? "this week's" : "that week's"} planned meals, your weekly buys and backup meals that are running low, and suggests a list. You check it, then approve it.
              </p>
              <form action={buildGroceries}>
                <input type="hidden" name="returnTo" value={returnTo} />
                <input type="hidden" name="week" value={week} />
                <Button>
                  <Sparkle size="1.375rem" aria-hidden />
                  Suggest this week&apos;s groceries
                </Button>
              </form>
              <p className="text-lg text-ink-muted">
                Change what you buy every week in <Link href="/meals/setup?tab=buys" className="font-bold text-accent underline">Setup</Link>.
              </p>
            </div>
          )}
        </Card>

        <Card
          title="The list"
          icon={ListChecks}
          tint="green"
          aside={
            ticked ? (
              <form action={clearTicked}>
                <input type="hidden" name="returnTo" value={returnTo} />
                <Button variant="secondary">
                  <Broom size="1.375rem" aria-hidden />
                  Clear {ticked} ticked
                </Button>
              </form>
            ) : null
          }
        >
          {aisleParam && shownAisles.length === 1 ? (
            <SoftLink href={here({ aisle: null })} className="mb-2 self-start">
              <CaretLeft size="1.25rem" weight="bold" aria-hidden />
              All aisles
            </SoftLink>
          ) : null}
          {list.length === 0 ? (
            <p className="text-xl text-ink-muted">The list is empty. Approve some suggestions, or add something below.</p>
          ) : (
            <div
              className="grid min-h-0 flex-1 gap-x-5 gap-y-3"
              style={{
                gridTemplateColumns: `repeat(${shownAisles.length === 1 ? 3 : Math.min(4, shownAisles.length)}, minmax(0, 1fr))`,
                gridTemplateRows: shownAisles.length > 4 ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)",
              }}
            >
              {shownAisles.map((aisle) => {
                const inAisle = list.filter((l) => l.item.aisle === aisle).sort((a, b) => Number(a.checked) - Number(b.checked));
                const limit = shownAisles.length === 1 ? inAisle.length : perAisle;
                const more = inAisle.length - limit;
                const visible = more > 0 ? inAisle.slice(0, limit - 1) : inAisle;
                const lineBlocks = visible.map((l) => <GroceryLine key={l.id} line={l} returnTo={returnTo} />);
                if (shownAisles.length === 1) {
                  return (
                    <div key={aisle} className="col-span-3 grid min-h-0 grid-flow-col grid-cols-3 content-start gap-x-5 gap-y-1" style={{ gridTemplateRows: "repeat(10, auto)" }}>
                      {lineBlocks}
                    </div>
                  );
                }
                return (
                  <section key={aisle} className="flex min-h-0 flex-col gap-1 overflow-hidden">
                    <h3 className="text-lg font-bold tracking-wide text-ink-muted uppercase">{aisle}</h3>
                    {lineBlocks}
                    {more > 0 ? (
                      <Link href={here({ aisle })} scroll={false} className="flex min-h-11 items-center text-lg font-bold text-accent">
                        + {more + 1} more
                      </Link>
                    ) : null}
                  </section>
                );
              })}
            </div>
          )}
          {hiddenAisles > 0 && !aisleParam ? <p className="text-lg text-ink-muted">+ {hiddenAisles} more aisles: tap an aisle&apos;s &quot;more&quot; to see it alone.</p> : null}
          <form action={addGrocery} className="mt-3 flex shrink-0 gap-2 border-t border-frame pt-3">
            <input type="hidden" name="returnTo" value={returnTo} />
            <Input name="amount" inputMode="decimal" placeholder="2" aria-label="Amount" className="w-20" />
            <Input name="unit" placeholder="L" aria-label="Unit" className="w-24" maxLength={20} />
            <Input name="name" placeholder="Add something (goes straight on the list)" aria-label="What" className="min-w-0 flex-1" maxLength={60} />
            <Button>
              <Plus size="1.25rem" weight="bold" aria-hidden />
              Add
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}

function GroceryLine({ line, returnTo }: { line: Line; returnTo: string }) {
  const amount = amountText(line.amount, line.unit);
  return (
    <form action={toggleGrocery}>
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="id" value={line.id} />
      <button className={`flex min-h-12 w-full items-center gap-2.5 rounded-xl text-left ${line.checked ? "opacity-45" : ""}`}>
        <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg border-2 ${line.checked ? "border-success bg-success text-white" : "border-check-border"}`}>
          {line.checked ? <Check size="1.25rem" weight="bold" aria-hidden /> : null}
        </span>
        {line.item.icon ? <Emoji emoji={line.item.icon} className="size-8" /> : null}
        <span className={`font-hand line-clamp-2 min-w-0 flex-1 text-2xl leading-tight text-ink ${line.checked ? "line-through" : ""}`}>
          {line.item.name}
          {amount ? <span className="font-sans text-base font-bold text-ink-muted"> {amount}</span> : null}
        </span>
      </button>
    </form>
  );
}
