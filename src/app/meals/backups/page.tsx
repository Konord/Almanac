import { Suspense } from "react";
import Link from "next/link";
import { Minus, PencilSimple, Plus } from "@phosphor-icons/react/dist/ssr";
import { AppFrame, Button, Emoji, Field, Input, SoftLink, firstParam } from "@/components/ui";
import { requireHousehold } from "@/lib/household";
import { addRecipe, adjustOnHand } from "../actions";
import { loadBackupParts, loadItems, loadMealBasics, readyCount } from "../data";
import { MealsHeader, Modal, Pager, linker, pageOf } from "../parts";
import { PartsEditor } from "./parts-editor";

/**
 * Backup meals: the ones you keep ready for a survival day (a frozen
 * lasagne and garlic bread, chicken and a packet of rice). Only their
 * parts are counted: using one counts them down, and a part below its
 * minimum is suggested for the grocery list.
 */
export default function BackupsPage(props: PageProps<"/meals/backups">) {
  return (
    <AppFrame section="meals">
      <Suspense fallback={<p className="text-lg text-ink-muted">Loading…</p>}>
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

  return (
    <>
      <MealsHeader title="Backup meals" tab="backups" error={firstParam(params.error)} message={firstParam(params.message)}>
        <SoftLink href={here({ new: "1" })}>
          <Plus size="1.5rem" weight="bold" aria-hidden />
          Backup meal
        </SoftLink>
      </MealsHeader>

      {backups.length === 0 ? (
        <p className="max-w-[60rem] text-xl text-ink-soft">
          A backup meal is one you keep ready for days when cooking isn&apos;t happening. Make one, then say what it&apos;s made of, how many you have, and the fewest you want to keep.
        </p>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-3 gap-5" style={{ gridTemplateRows: "repeat(2, minmax(0, 1fr))" }}>
          {shown.items.map((b) => {
            const mine = parts.filter((p) => p.recipe_id === b.id);
            const ready = readyCount(mine);
            return (
              <section key={b.id} className="flex min-h-0 flex-col gap-2 overflow-hidden rounded-[var(--radius-card)] border border-frame bg-board p-4">
                <div className="flex items-center gap-3">
                  <Emoji emoji={b.icon ?? "🧊"} className="size-16" />
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-2xl font-bold text-ink">{b.name}</h2>
                    <p className={`text-lg font-bold ${ready > 0 ? "text-success" : "text-danger"}`}>{ready > 0 ? `Ready ${ready} time${ready === 1 ? "" : "s"}` : "Not ready: restock"}</p>
                  </div>
                  <Link href={here({ edit: b.id })} scroll={false} aria-label={`Edit ${b.name}`} className="flex size-[var(--touch-target)] items-center justify-center rounded-full bg-rail text-ink">
                    <PencilSimple size="1.375rem" aria-hidden />
                  </Link>
                </div>
                <ul className="flex min-h-0 flex-1 flex-col gap-1">
                  {mine.slice(0, 4).map((p) => {
                    const low = p.on_hand < p.keep_at_least;
                    return (
                      <li key={p.id} className="flex min-h-14 items-center gap-2 rounded-xl bg-rail px-3">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xl font-bold text-ink">{itemById.get(p.item_id)?.name ?? "Part"}</span>
                          <span className={`text-base ${low ? "font-bold text-danger" : "text-ink-muted"}`}>
                            Keep {p.keep_at_least}
                            {p.uses !== 1 ? ` · uses ${p.uses}` : ""}
                          </span>
                        </span>
                        {[-1, 1].map((delta) => (
                          <form key={delta} action={adjustOnHand} className={delta === 1 ? "order-last" : ""}>
                            <input type="hidden" name="returnTo" value={returnTo} />
                            <input type="hidden" name="id" value={p.id} />
                            <input type="hidden" name="delta" value={delta} />
                            <button aria-label={delta === 1 ? "One more" : "One fewer"} className="flex size-11 items-center justify-center rounded-full bg-board text-ink">
                              {delta === 1 ? <Plus size="1.25rem" weight="bold" aria-hidden /> : <Minus size="1.25rem" weight="bold" aria-hidden />}
                            </button>
                          </form>
                        ))}
                        <span className={`min-w-10 text-center text-2xl font-extrabold tabular-nums ${low ? "text-danger" : "text-ink"}`}>{p.on_hand}</span>
                      </li>
                    );
                  })}
                  {mine.length === 0 ? <li className="text-lg text-ink-muted">No parts yet. Tap the pencil to add them.</li> : null}
                  {mine.length > 4 ? (
                    <li>
                      <Link href={here({ edit: b.id })} scroll={false} className="text-lg font-bold text-accent">
                        + {mine.length - 4} more parts
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
              <Input name="name" placeholder="Frozen lasagne night" maxLength={80} required className="w-[30rem]" />
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
