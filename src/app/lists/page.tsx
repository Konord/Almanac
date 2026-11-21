import { Suspense } from "react";
import Link from "next/link";
import { FitList } from "@/components/fit-list";
import { PencilSimple, Plus } from "@phosphor-icons/react/dist/ssr";
import { ActionLink, AppFrame, Button, Card, Emoji, Input, Notice, ScreenHeader, Select, SoftLink, firstParam, LoadingOutline } from "@/components/ui";
import { Sheet } from "@/components/sheet";
import { EmojiPicker } from "@/components/emoji-picker";
import { DayField, TimeField } from "@/components/touch-pickers";
import { requireHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { localDateOf, type LocalDate } from "@/lib/time";
import { onItsList } from "@/lib/todos";
import { panelBoxes } from "@/lib/panel-boxes";
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
 * Lists (Glance): the list editor. Left, every list (picture, name, how
 * many are open) and New list; middle, the list picked. Groceries show
 * aisle columns; the Chores list adds with tags; other lists add with a
 * day (Done by / On), a time and who. The words are handwritten in the
 * person's ink, on the same row as the Daily List. Lists are mostly
 * reached from the Daily List, whose title opens the list it shows.
 */
export default function ListsPage(props: PageProps<"/lists">) {
  return (
    <AppFrame section="lists">
      <Suspense fallback={<LoadingOutline />}>
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
  // The lists that are boxes beside the Daily List (the Chores list's box is the chore bucket).
  const rotation = panelBoxes(household.settings.panelBoxes, lists, false).map((b) => b.id);

  return (
    <>
      <ScreenHeader title="Lists" action={<ActionLink href={here("&newList=1")}>New list</ActionLink>} />

      {error ? <Notice tone="error">{error}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}

      {/* Master–detail (Glance mock): the lists on the left, the one picked in the middle. */}
      <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[22rem_minmax(0,1fr)]">
        {/* Which list: as many as fit, then pages (there can be lots). */}
        <Card>
          <FitList
            heading={<span className="text-[1.75rem]">Lists</span>}
            fallback={LISTS_PAGE}
            focus={Math.max(0, lists.findIndex((l) => l.id === list?.id))}
            className="gap-1"
            rows={lists.map((l) => {
              const count = l.is_groceries ? groceries.filter((g) => !g.checked).length : todos.filter((t) => t.list_id === l.id && t.status === "open").length;
              const active = l.id === list?.id;
              return (
                <li key={l.id}>
                  <Link
                    href={`/lists?list=${l.id}`}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-16 items-center gap-[0.7rem] rounded-[var(--radius)] px-3 ${active ? "bg-rail shadow-[inset_0_0_0_2px_var(--color-ink)]" : "hover:bg-rail"}`}
                  >
                    <Emoji emoji={l.icon ?? "📝"} className="size-[2.15rem]" />
                    <span className="min-w-0 flex-1 truncate text-[1.5rem] font-extrabold text-ink">{l.name}</span>
                    <span className="tabular text-[1.35rem] font-extrabold text-ink-muted">{count || ""}</span>
                  </Link>
                </li>
              );
            })}
          />
        </Card>

        {/* The list itself */}
        <Card>
          {list ? (
            <>
              <div className="mb-[0.35rem] flex shrink-0 items-center gap-[0.7rem]">
                <h2 className="min-w-0 flex-1 truncate text-[1.85rem] font-extrabold text-ink">{list.name}</h2>
                <Link
                  href={here("&editList=1")}
                  scroll={false}
                  aria-label={list.is_groceries || list.is_chores ? "Rename this list or change its picture" : "Rename or remove this list"}
                  title="Rename or change the picture"
                  className="flex size-[var(--touch-target)] shrink-0 items-center justify-center rounded-full bg-panel text-ink"
                >
                  <PencilSimple size="1.5rem" aria-hidden />
                </Link>
              </div>
              {list.is_groceries ? (
                // The grocery list: its own lines, with amounts and aisles (saving the weekly review fills it).
                <div className="flex flex-col lg:min-h-0 lg:flex-1">
                  <GroceryView initial={groceries} rows={10} columns={4} />
                </div>
              ) : (
                <>
                  {list.is_chores ? (
                    // The Chores list: just the words and tags; the chore planner picks the day.
                    <form action={addTodo} className="mb-2 flex shrink-0 flex-col gap-2">
                      <input type="hidden" name="listId" value={list.id} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <div className="flex items-center gap-[0.6rem]">
                        <Input name="title" required maxLength={120} aria-label="New chore" placeholder="Add a chore" className="max-w-[36rem] min-w-0 flex-1 font-hand text-[1.5rem]!" />
                        <Button>
                          <Plus size="1.25rem" weight="bold" aria-hidden />
                          Add
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-2" role="group" aria-label="Tags">
                        {CHORE_TAGS.map((t) => (
                          <label
                            key={t.value}
                            className="flex min-h-[var(--touch-target)] cursor-pointer items-center rounded-full border-2 border-frame bg-board px-[1.1rem] text-[1.25rem] font-bold text-ink-soft select-none has-checked:border-ink has-checked:bg-rail has-checked:text-ink"
                          >
                            <input type="checkbox" name="tags" value={t.value} className="sr-only" />
                            {t.label}
                          </label>
                        ))}
                      </div>
                    </form>
                  ) : (
                    // Other lists: the words, Done by / On a day, a time (shows on the calendar), and who.
                    <form action={addTodo} className="mb-2 flex shrink-0 flex-wrap items-center gap-[0.6rem]">
                      <input type="hidden" name="listId" value={list.id} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <Input name="title" required maxLength={120} aria-label="New to-do" placeholder="Add something" className="min-w-56 flex-[3] font-hand text-[1.5rem]!" />
                      <Select name="dateKind" aria-label="What the day means" defaultValue="due" className="min-w-36 flex-1">
                        <option value="due">Done by</option>
                        <option value="start">On</option>
                      </Select>
                      <DayField name="dueDate" allowEmpty emptyText="Any day" aria-label="Day (optional)" className="min-w-44 flex-1" />
                      <TimeField name="atTime" step={5} allowEmpty emptyText="Any time" aria-label="Time (optional)" className="min-w-40 flex-1" />
                      <Select name="assigneeId" aria-label="For someone (optional)" defaultValue="" className="min-w-36 flex-1">
                        <option value="">Anyone</option>
                        {members.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </Select>
                      <Button>
                        <Plus size="1.25rem" weight="bold" aria-hidden />
                        Add
                      </Button>
                    </form>
                  )}
                  <div className="flex flex-col lg:min-h-0 lg:flex-1">
                    {showingDone ? (
                      <FitList
                        key={`${list.id}-done`}
                        fallback={LIST_PAGE}
                        heading={<span className="text-[1.25rem] text-ink-muted">Done ({done.length})</span>}
                        rows={done.map((t) => (
                          <TodoRow key={t.id} todo={t} members={memberById} today={today} household={household} returnTo={here("&done=1")} />
                        ))}
                        footer={
                          <>
                            <SoftLink href={here()}>Back to the list</SoftLink>
                            {done.length > 0 ? (
                              <form action={clearDone} className="ml-auto">
                                <input type="hidden" name="listId" value={list.id} />
                                <input type="hidden" name="returnTo" value={returnTo} />
                                <Button variant="secondary">Clear the done ones</Button>
                              </form>
                            ) : null}
                          </>
                        }
                      />
                    ) : (
                      <FitList
                        key={list.id}
                        fallback={LIST_PAGE}
                        empty={<li className="py-4 text-xl text-ink-muted">Nothing on this list</li>}
                        rows={open.map((t) => (
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
                        footer={done.length > 0 ? <SoftLink href={here("&done=1")}>Done ({done.length})</SoftLink> : undefined}
                      />
                    )}
                  </div>
                </>
              )}
            </>
          ) : (
            <p className="text-xl text-ink-muted">No lists yet. Make one with New list.</p>
          )}
        </Card>
      </div>

      {editing ? (
        <Sheet title="Edit to-do" closeHref={returnTo}>
          <form id="edit-todo" action={updateTodo} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="id" value={editing.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <TodoFields members={members} lists={lists.filter((l) => !l.is_chores && !l.is_groceries)} choreDays={choreDays} todo={editing} showList chore={editing.is_chore} />
          </form>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button form="edit-todo" variant="save">Save</Button>
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
            <ListFields name={list.name} icon={list.icon} inRotation={rotation.includes(list.is_chores ? "bucket" : list.id)} />
            <div className="sm:col-span-2">
              <Button variant="save">Save</Button>
            </div>
          </form>
          {list.is_groceries || list.is_chores ? null : (
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
            <ListFields inRotation={false} />
            <div className="sm:col-span-2">
              <Button>Make list</Button>
            </div>
          </form>
        </Sheet>
      ) : null}
    </>
  );
}

function ListFields({ name, icon, inRotation }: { name?: string; icon?: string | null; inRotation: boolean }) {
  return (
    <>
      <label className="flex flex-col gap-1.5">
        <span className="text-base font-bold text-ink">Name</span>
        <Input name="name" defaultValue={name} required maxLength={40} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-base font-bold text-ink">Picture</span>
        <EmojiPicker initial={icon ?? ""} nameField="name" className="self-start!" fullScreen />
      </label>
      {/* Whether it's one of the boxes the Daily List flips to (same as Settings › Today panel). */}
      <label className="flex min-h-[var(--touch-target)] cursor-pointer items-center gap-3 text-lg font-bold text-ink select-none sm:col-span-2">
        <input type="checkbox" name="inRotation" defaultChecked={inRotation} className="size-6 accent-ink" />
        Show it beside the Daily List (flip to it with the arrows)
      </label>
    </>
  );
}

/* Long lists turn into pages, so nothing scrolls on the wall screen. Before the lists are measured: */
const LIST_PAGE = 8;
const LISTS_PAGE = 10;

