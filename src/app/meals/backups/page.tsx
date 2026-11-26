import { Suspense } from "react";
import Link from "next/link";
import { Minus, PencilSimple, Plus, ShoppingCart } from "@phosphor-icons/react/dist/ssr";
import { ActionLink, AppFrame, Button, Emoji, Field, Input, firstParam, LoadingOutline, secondaryActionClass } from "@/components/ui";
import { requireHousehold } from "@/lib/household";
import { addRecipe, adjustOnHand, putLowPartsOnList } from "../actions";
import { loadBackupParts, loadItems, loadMealBasics, readyCount } from "../data";
import { MealsHeader, Modal, Pager, linker, pageOf } from "../parts";
import { PartsEditor } from "./parts-editor";

/**
 * Backup meals: the ones you keep ready for a survival day (a frozen
 * lasagne and garlic bread, chicken and a packet of rice). Only their
 * parts are counted: using one counts them down, and a part below its
 * minimum is suggested for the grocery list (or put there with "Put low
 * parts on the grocery list").
 */
/** One − or + on a part's count (a little form, so it works without the browser's help). */
function Step({ id, delta, returnTo }: { id: string; delta: 1 | -1; returnTo: string }) {
  return (
    <form action={adjustOnHand}>
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="delta" value={delta} />
      <button aria-label={delta === 1 ? "One more" : "One fewer"} className="flex size-12 items-center justify-center rounded-full bg-panel text-ink">
        {delta === 1 ? <Plus size="1.25rem" weight="bold" aria-hidden /> : <Minus size="1.25rem" weight="bold" aria-hidden />}
      </button>
    </form>
  );
}

export default function BackupsPage(props: PageProps<"/meals/backups">) {
  return (
    <AppFrame section="meals">
      <Suspense fallback={<LoadingOutline />}>
        <Backups searchParams={props.searchParams} />
      </Suspense>
    </AppFrame>
  );
}

const PER_PAGE = 6;

async function Backups({ searchParams }: { searchParams: PageProps<"/meals/backups">["searchParams"] }) {
  await requireHousehold();
  const params = await searchParams;
  const [basics, parts, items] = await Promise.all([loadMealBasics(), loadBackupParts(), loadItems()]);
  const itemById = new Map(items.map((i) => [i.id, i]));
  const backups = basics.recipes.filter((r) => r.is_backup);
  const shown = pageOf(backups, Number(firstParam(params.page) ?? 0), PER_PAGE);
  const here = linker("/meals/backups", { page: shown.page ? String(shown.page) : null });
  const returnTo = here({});
  const editId = firstParam(params.edit);
  const editing = editId ? backups.find((b) => b.id === editId) : undefined;

  const low = parts.filter((p) => p.on_hand < p.keep_at_least);
  // One row of tall cards when they fit (the mock), two rows when there are more.
  const oneRow = shown.items.length <= 3;
  const partsShown = oneRow ? 10 : 4;

  return (
    <>
      <MealsHeader tab="backups" error={firstParam(params.error)} message={firstParam(params.message)}>
        {low.length ? (
          // Parts below their minimum, onto the grocery list (the same restock lines a swap makes).
          <form action={putLowPartsOnList}>
            <input type="hidden" name="returnTo" value={returnTo} />
            <button className={secondaryActionClass}>
              <ShoppingCart size="1.25rem" weight="bold" aria-hidden />
              Add what&rsquo;s low to groceries
            </button>
          </form>
        ) : null}
        <ActionLink href={here({ new: "1" })} scroll={false}>
          New backup
        </ActionLink>
      </MealsHeader>

      {backups.length === 0 ? (
        <section className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] bg-board shadow-raised">
          <Emoji emoji="🛟" className="size-16" />
          <p className="text-2xl font-bold text-ink">No backup meals yet</p>
          <p className="text-lg text-ink-muted">Meals you keep ready for a tired night: a frozen lasagne, chicken and a packet of rice.</p>
        </section>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-3 gap-5" style={{ gridTemplateRows: oneRow ? "minmax(0, 1fr)" : "repeat(2, minmax(0, 1fr))" }}>
          {shown.items.map((b) => {
            const mine = parts.filter((p) => p.recipe_id === b.id);
            const ready = readyCount(mine);
            return (
              <section key={b.id} className="flex min-h-0 flex-col gap-[0.7rem] overflow-hidden rounded-[var(--radius-card)] bg-board px-[1.4rem] py-5 shadow-raised">
                <div className="flex shrink-0 items-center gap-3">
                  <Emoji emoji={b.icon ?? "🧊"} className="size-16" />
                  <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                    <h2 className="max-w-full truncate text-[2rem] leading-tight font-extrabold tracking-[-0.02em] text-ink">{b.name}</h2>
                    <span
                      className={`tabular inline-flex min-h-10 items-center rounded-full px-[0.8rem] text-[1.15rem] font-extrabold ${
                        ready > 0 ? "bg-[color-mix(in_srgb,var(--color-success)_16%,white)] text-success" : "bg-alert-soft text-now-on-tint"
                      }`}
                    >
                      {ready > 0 ? `Enough for ${ready} ${ready === 1 ? "time" : "times"}` : "Needs restocking"}
                    </span>
                  </div>
                  <Link href={here({ edit: b.id })} scroll={false} aria-label={`Edit ${b.name}`} className="flex size-[var(--touch-target)] shrink-0 items-center justify-center rounded-full bg-panel text-ink">
                    <PencilSimple size="1.5rem" aria-hidden />
                  </Link>
                </div>
                <ul className="flex min-h-0 flex-1 flex-col">
                  {mine.slice(0, partsShown).map((p) => {
                    const short = p.on_hand < p.keep_at_least;
                    return (
                      <li key={p.id} className="flex min-h-[3.6rem] shrink-0 items-center gap-[0.7rem] border-b border-frame last:border-b-0">
                        <span className={`min-w-0 flex-1 truncate text-[1.5rem] font-bold ${short ? "text-now-on-tint" : "text-ink"}`}>{itemById.get(p.item_id)?.name ?? "Part"}</span>
                        {/* How many to keep (and how many one meal uses), so "low" makes sense. */}
                        <span className={`tabular shrink-0 text-[1.15rem] font-bold ${short ? "text-now-on-tint" : "text-ink-muted"}`}>
                          keep {p.keep_at_least}
                          {p.uses !== 1 ? ` · uses ${p.uses}` : ""}
                        </span>
                        <div className="flex shrink-0 items-center gap-1">
                          <Step id={p.id} delta={-1} returnTo={returnTo} />
                          <span className={`tabular min-w-[2.2rem] text-center text-[1.75rem] font-extrabold ${short ? "text-now-on-tint" : "text-ink"}`}>{p.on_hand}</span>
                          <Step id={p.id} delta={1} returnTo={returnTo} />
                        </div>
                      </li>
                    );
                  })}
                  {mine.length === 0 ? <li className="text-lg text-ink-muted">No parts yet</li> : null}
                  {mine.length > partsShown ? (
                    <li>
                      <Link href={here({ edit: b.id })} scroll={false} className="flex min-h-12 items-center text-lg font-bold text-accent">
                        + {mine.length - partsShown} more parts
                      </Link>
                    </li>
                  ) : null}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      <Pager page={shown.page} pages={shown.pages} href={(n) => here({ page: n ? String(n) : null })} />

      {firstParam(params.new) ? (
        <Modal title="New backup meal" icon={<Emoji emoji="🛟" className="size-12" />} closeHref={here({})}>
          <form action={addRecipe} className="flex items-end gap-4">
            <input type="hidden" name="returnTo" value={here({ new: "1" })} />
            <input type="hidden" name="backup" value="1" />
            <Field label="Name">
              <Input name="name" maxLength={80} required className="w-[30rem]" />
            </Field>
            <Button>Next: its parts</Button>
          </form>
        </Modal>
      ) : null}
      {editing ? (
        <Modal title={`Edit ${editing.name}`} icon={<Emoji emoji={editing.icon ?? "🧊"} className="size-12" />} closeHref={here({})} wide>
          <PartsEditor
            recipeId={editing.id}
            name={editing.name}
            icon={editing.icon ?? ""}
            returnTo={here({ edit: editing.id })}
            initial={parts
              .filter((p) => p.recipe_id === editing.id)
              .map((p) => ({ name: itemById.get(p.item_id)?.name ?? "", uses: String(p.uses), onHand: String(p.on_hand), keep: String(p.keep_at_least) }))}
          />
        </Modal>
      ) : null}
    </>
  );
}
