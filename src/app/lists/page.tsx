import { Suspense } from "react";
import Link from "next/link";
import { ListChecks, PencilSimple, Plus } from "@phosphor-icons/react/dist/ssr";
import { AppFrame, Button, Card, Emoji, Input, Notice, ScreenHeader, Select, SoftLink, firstParam } from "@/components/ui";
import { Sheet } from "@/components/sheet";
import { EmojiPicker } from "@/components/emoji-picker";
import { requireHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { localDateOf, type LocalDate } from "@/lib/time";
import { onItsList } from "@/lib/todos";
import { CHORE_TAGS } from "@/lib/chore-days";
import { addList, addTodo, clearDone, removeList, removeTodo, updateList, updateTodo } from "../chores/actions";
import { loadTodos, type ChoreMember } from "../chores/data";
import { choreSchedule } from "../chores/plan";
import { TodoFields } from "../chores/forms";
import { TodoRow } from "../chores/rows";
import { syncEventAndChoreHeadsUps } from "../heads-ups/sync";
import { loadGroceries } from "../groceries/data";
import { GroceryView } from "../groceries/view";

/**
 * To-do lists. Each to-do can have a day and a person, both optional.
 * The words are in handwriting (unless that's switched off in Settings).
 */
export default function ListsPage(props: PageProps<"/lists">) {
  return (
    <AppFrame section="lists">
      <Suspense fallback={<p className="text-lg text-ink-muted">Loading…</p>}>
        <Lists searchParams={props.searchParams} />
      </Suspense>
    </AppFrame>
  );
}

async function Lists({ searchParams }: { searchParams: PageProps<"/lists">["searchParams"] }) {
  const household = await requireHousehold();
  const params = await searchParams;
  const { timeZone } = household.settings;
  const today = localDateOf(new Date(), timeZone);
  // Heads-ups due soon become to-dos before the lists are read.
  await syncEventAndChoreHeadsUps(household);
  const { choreDays, plan } = await choreSchedule(household, today, timeZone);
  // Where the chore planner has put each one-off chore (none: no room in the next two weeks).
  const plannedOn = new Map<string, LocalDate>();
  for (const day of plan.days) for (const item of day.items) if (item.kind === "one-off" && !plannedOn.has(item.id)) plannedOn.set(item.id, day.date);
  const supabase = await createClient();
  const [{ lists, todos: allTodos }, { data: memberRows }, groceries] = await Promise.all([
    loadTodos(),
    supabase.from("members").select("id, name, colour, icon").order("sort_order").order("name"),
    loadGroceries(household),
  ]);
  // Chores and heads-ups live on the daily list (Today panel), not here.
  const todos = allTodos.filter(onItsList);
  const members = (memberRows ?? []) as ChoreMember[];
  const memberById = new Map(members.map((m) => [m.id, m]));
  const listParam = firstParam(params.list);
  const list = lists.find((l) => l.id === listParam) ?? lists[0];
  const here = (extra = "") => `/lists${list ? `?list=${list.id}${extra}` : extra ? `?${extra.slice(1)}` : ""}`;
  const returnTo = here();
  const open = todos.filter((t) => t.list_id === list?.id && t.status === "open");
  const done = todos.filter((t) => t.list_id === list?.id && t.status === "done");
  const editId = firstParam(params.edit);
  const editing = editId ? todos.find((t) => t.id === editId) : undefined;
  const editingList = firstParam(params.editList) === "1" && list;
  const addingList = firstParam(params.newList) === "1";
  const error = firstParam(params.error);
  const message = firstParam(params.message);
  const showingDone = firstParam(params.done) === "1";
  const page = Math.max(0, Number(firstParam(params.page) ?? 0) || 0);

  return (
    <>
      <ScreenHeader title="List Manager" />

      {error ? <Notice tone="error">{error}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}

      <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
        {/* Which list */}
        <Card title="Lists" icon={ListChecks} tint="blue">
          <ul className="flex flex-col gap-1.5 lg:min-h-0 lg:overflow-hidden">
            {lists.map((l) => {
              const count = l.is_groceries ? groceries.filter((g) => !g.checked).length : todos.filter((t) => t.list_id === l.id && t.status === "open").length;
              const active = l.id === list?.id;
              return (
                <li key={l.id}>
                  <Link
                    href={`/lists?list=${l.id}`}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-16 items-center gap-3 rounded-2xl px-3 ${active ? "bg-rail shadow-[inset_0_0_0_2px_var(--color-ink)]" : "hover:bg-rail"}`}
                  >
                    <Emoji emoji={l.icon ?? "📝"} className="size-9" />
                    <span className="min-w-0 flex-1 truncate text-xl font-bold text-ink">{l.name}</span>
                    <span className="text-lg font-bold text-ink-muted">{count || ""}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <SoftLink href={here("&newList=1")} className="mt-3">
            <Plus size="1.5rem" aria-hidden />
            New list
          </SoftLink>
        </Card>

        {/* The list itself */}
        {list ? (
          <Card
            title={list.name}
            icon={ListChecks}
            tint="teal"
            aside={
              <Link
                href={here("&editList=1")}
                scroll={false}
                aria-label="Rename or remove this list"
                className="flex size-[var(--touch-target)] items-center justify-center rounded-full text-ink-muted hover:bg-rail"
              >
                <PencilSimple size="1.5rem" aria-hidden />
              </Link>
            }
          >
            {list.is_groceries ? (
              // The grocery list: its own lines, with amounts and aisles (saving the weekly review fills it).
              <div className="mt-2 flex flex-col lg:min-h-0 lg:flex-1">
                <GroceryView initial={groceries} rows={10} columns={4} />
              </div>
            ) : list.is_chores ? (
              // The Chores list: just the words and tags; the chore planner picks the day.
              <form action={addTodo} className="mt-2 mb-2 flex flex-col gap-2">
                <input type="hidden" name="listId" value={list.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <div className="flex items-center gap-2">
                  <Input name="title" placeholder="Add a chore… the planner picks a day" required maxLength={120} aria-label="New chore" className="min-w-0 flex-1" />
                  <Button>
                    <Plus size="1.25rem" weight="bold" aria-hidden />
                    Add
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Tags">
                  {CHORE_TAGS.map((t) => (
                    <label
                      key={t.value}
                      title={t.hint}
                      className="flex min-h-11 cursor-pointer items-center rounded-full border-2 border-frame bg-board px-3.5 text-base text-ink select-none has-checked:border-ink has-checked:bg-rail has-checked:font-bold"
                    >
                      <input type="checkbox" name="tags" value={t.value} className="sr-only" />
                      {t.label}
                    </label>
                  ))}
                </div>
              </form>
            ) : (
            <form action={addTodo} className="mt-2 mb-2 flex flex-wrap items-center gap-2">
              <input type="hidden" name="listId" value={list.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <div className="min-w-56 flex-[3]">
                <Input name="title" placeholder="Add a to-do…" required maxLength={120} aria-label="New to-do" className="w-full" />
              </div>
              <div className="min-w-36 flex-1">
                <Select name="dateKind" aria-label="What the day means" defaultValue="due" className="w-full">
                  <option value="due">Done by</option>
                  <option value="start">On</option>
                </Select>
              </div>
              <div className="min-w-44 flex-1">
                <Input name="dueDate" type="date" aria-label="Day (optional)" className="w-full" />
              </div>
              <div className="min-w-32 flex-1">
                <Input name="atTime" type="time" aria-label="Time (optional)" title="Time (optional): with a day, it shows on the calendar" className="w-full" />
              </div>
              <div className="min-w-36 flex-1">
                <Select name="assigneeId" aria-label="For someone (optional)" defaultValue="" className="w-full">
                  <option value="">Anyone</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </div>
              <Button>
                <Plus size="1.25rem" weight="bold" aria-hidden />
                Add
              </Button>
            </form>
            )}
            {list.is_groceries ? null : (
            <div className="flex flex-col lg:min-h-0 lg:flex-1">
              {showingDone ? (
                <>
                  <ul className="flex flex-col">
                    {pageOf(done, page, LIST_PAGE).map((t) => (
                      <TodoRow key={t.id} todo={t} members={memberById} today={today} household={household} returnTo={returnTo} />
                    ))}
                  </ul>
                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
                    <SoftLink href={here()}>Back to the list</SoftLink>
                    <Pager count={done.length} page={page} perPage={LIST_PAGE} href={(p) => here(`&done=1&page=${p}`)} />
                    <form action={clearDone} className="ml-auto">
                      <input type="hidden" name="listId" value={list.id} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <Button variant="secondary">Clear the done ones</Button>
                    </form>
                  </div>
                </>
              ) : (
                <>
                  {open.length === 0 ? <p className="py-4 text-xl text-ink-muted">Nothing on this list. Add something above.</p> : null}
                  <ul className="flex flex-col">
                    {pageOf(open, page, LIST_PAGE).map((t) => (
                      <TodoRow
                        key={t.id}
                        todo={t}
                        members={memberById}
                        today={today}
                        household={household}
                        returnTo={returnTo}
                        editHref={here(`&edit=${t.id}`)}
                        plannedOn={plannedOn}
                      />
                    ))}
                  </ul>
                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
                    <Pager count={open.length} page={page} perPage={LIST_PAGE} href={(p) => here(`&page=${p}`)} />
                    {done.length > 0 ? <SoftLink href={here("&done=1")}>Done ({done.length})</SoftLink> : null}
                  </div>
                </>
              )}
            </div>
            )}
          </Card>
        ) : (
          <Card title="No lists yet" icon={ListChecks} tint="teal">
            <p className="text-xl text-ink-muted">Make a list to start adding to-dos.</p>
          </Card>
        )}

      </div>

      {editing ? (
        <Sheet title="Edit to-do" closeHref={returnTo}>
          <form id="edit-todo" action={updateTodo} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="id" value={editing.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <TodoFields members={members} lists={lists.filter((l) => !l.is_chores && !l.is_groceries)} choreDays={choreDays} todo={editing} showList chore={editing.is_chore} />
          </form>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button form="edit-todo">Save</Button>
            <form action={removeTodo} className="ml-auto">
              <input type="hidden" name="id" value={editing.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <Button variant="danger">Remove this to-do</Button>
            </form>
          </div>
        </Sheet>
      ) : null}

      {editingList ? (
        <Sheet title={`The ${list.name} list`} closeHref={returnTo}>
          <form action={updateList} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="id" value={list.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <ListFields name={list.name} icon={list.icon} />
            <div className="sm:col-span-2">
              <Button>Save list</Button>
            </div>
          </form>
          {list.is_groceries ? (
            <p className="mt-6 text-lg text-ink-muted">This is the grocery list: saving the weekly review puts the menu on it. The list stays, but you can rename it.</p>
          ) : list.is_chores ? (
            <p className="mt-6 text-lg text-ink-muted">Everything on this list is a chore. The list stays, but you can rename it.</p>
          ) : (
            <form action={removeList} className="mt-6">
              <input type="hidden" name="id" value={list.id} />
              <input type="hidden" name="name" value={list.name} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <Button variant="danger">Remove the list and its to-dos</Button>
            </form>
          )}
        </Sheet>
      ) : null}

      {addingList ? (
        <Sheet title="New list" closeHref={returnTo}>
          <form action={addList} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="returnTo" value={returnTo} />
            <ListFields />
            <div className="sm:col-span-2">
              <Button>Make list</Button>
            </div>
          </form>
        </Sheet>
      ) : null}
    </>
  );
}

function ListFields({ name, icon }: { name?: string; icon?: string | null }) {
  return (
    <>
      <label className="flex flex-col gap-1.5">
        <span className="text-base font-bold text-ink">Name</span>
        <Input name="name" defaultValue={name} required maxLength={40} placeholder="Errands" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-base font-bold text-ink">Picture</span>
        <EmojiPicker initial={icon ?? ""} nameField="name" className="self-start!" fullScreen />
        <span className="text-sm text-ink-muted">Tap to pick one.</span>
      </label>
    </>
  );
}

/* Long lists turn into pages, so nothing scrolls on the wall screen. */
const LIST_PAGE = 8;

function pageOf<T>(items: T[], page: number, perPage: number): T[] {
  const last = Math.max(0, Math.ceil(items.length / perPage) - 1);
  const p = Math.min(page, last);
  return items.slice(p * perPage, p * perPage + perPage);
}

function Pager({ count, page, perPage, href }: { count: number; page: number; perPage: number; href: (page: number) => string }) {
  const pages = Math.ceil(count / perPage);
  if (pages <= 1) return null;
  const p = Math.min(page, pages - 1);
  return (
    <span className="flex items-center gap-2 text-base font-bold">
      {p > 0 ? (
        <Link href={href(p - 1)} className="flex min-h-11 items-center rounded-xl bg-rail px-3 text-ink">
          ‹
        </Link>
      ) : null}
      <span className="text-ink-muted">
        {p * perPage + 1}–{Math.min(count, (p + 1) * perPage)} of {count}
      </span>
      {p < pages - 1 ? (
        <Link href={href(p + 1)} className="flex min-h-11 items-center rounded-xl bg-rail px-3 text-ink">
          More ›
        </Link>
      ) : null}
    </span>
  );
}
