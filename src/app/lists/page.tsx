import { Suspense } from "react";
import Link from "next/link";
import { CalendarDots, ListChecks, PencilSimple, Plus } from "@phosphor-icons/react/dist/ssr";
import { AppFrame, Button, Card, Emoji, Input, Notice, ScreenHeader, Select, SoftLink, firstParam } from "@/components/ui";
import { HeaderClock } from "@/components/header-clock";
import { Sheet } from "@/components/sheet";
import { requireHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { localDateOf } from "@/lib/time";
import { addList, addTodo, clearDone, removeList, removeTodo, updateList, updateTodo } from "../chores/actions";
import { loadTodos, type ChoreMember } from "../chores/data";
import { TodoFields } from "../chores/forms";
import { TodoRow } from "../chores/rows";

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
  const { locale, timeZone } = household.settings;
  const today = localDateOf(new Date(), timeZone);
  const supabase = await createClient();
  const [{ lists, todos }, { data: memberRows }] = await Promise.all([
    loadTodos(),
    supabase.from("members").select("id, name, colour, icon").order("sort_order").order("name"),
  ]);
  const members = (memberRows ?? []) as ChoreMember[];
  const memberById = new Map(members.map((m) => [m.id, m]));
  const listParam = firstParam(params.list);
  const list = lists.find((l) => l.id === listParam) ?? lists[0];
  const here = (extra = "") => `/lists${list ? `?list=${list.id}${extra}` : extra ? `?${extra.slice(1)}` : ""}`;
  const returnTo = here();
  const open = todos.filter((t) => t.list_id === list?.id && t.status === "open");
  const done = todos.filter((t) => t.list_id === list?.id && t.status === "done");
  const dated = todos.filter((t) => t.status === "open" && t.due_date).sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1));
  const listById = new Map(lists.map((l) => [l.id, l]));
  const editId = firstParam(params.edit);
  const editing = editId ? todos.find((t) => t.id === editId) : undefined;
  const editingList = firstParam(params.editList) === "1" && list;
  const addingList = firstParam(params.newList) === "1";
  const error = firstParam(params.error);
  const message = firstParam(params.message);

  return (
    <>
      <ScreenHeader title="Lists">
        <HeaderClock locale={locale} timeZone={timeZone} />
      </ScreenHeader>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}

      <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)]">
        {/* Which list */}
        <Card title="Lists" icon={ListChecks} tint="blue">
          <ul className="flex flex-col gap-1.5 lg:min-h-0 lg:overflow-y-auto">
            {lists.map((l) => {
              const count = todos.filter((t) => t.list_id === l.id && t.status === "open").length;
              const active = l.id === list?.id;
              return (
                <li key={l.id}>
                  <Link
                    href={`/lists?list=${l.id}`}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-16 items-center gap-3 rounded-2xl px-3 ${active ? "bg-rail shadow-[inset_0_0_0_2px_var(--color-frame)]" : "hover:bg-rail"}`}
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
            <form action={addTodo} className="mt-2 mb-2 flex flex-wrap items-center gap-2">
              <input type="hidden" name="listId" value={list.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <div className="min-w-56 flex-[3]">
                <Input name="title" placeholder="Add a to-do…" required maxLength={120} aria-label="New to-do" className="w-full" />
              </div>
              <div className="min-w-44 flex-1">
                <Input name="dueDate" type="date" aria-label="For a day (optional)" className="w-full" />
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
            <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
              {open.length === 0 ? <p className="py-4 text-xl text-ink-muted">Nothing on this list. Add something above.</p> : null}
              <ul className="flex flex-col">
                {open.map((t) => (
                  <TodoRow
                    key={t.id}
                    todo={t}
                    members={memberById}
                    today={today}
                    household={household}
                    returnTo={returnTo}
                    editHref={here(`&edit=${t.id}`)}
                  />
                ))}
              </ul>
              {done.length > 0 ? (
                <details className="mt-3">
                  <summary className="flex min-h-[var(--touch-target)] cursor-pointer items-center text-lg font-bold text-ink-muted">
                    Done ({done.length})
                  </summary>
                  <ul className="flex flex-col">
                    {done.map((t) => (
                      <TodoRow key={t.id} todo={t} members={memberById} today={today} household={household} returnTo={returnTo} />
                    ))}
                  </ul>
                  <form action={clearDone} className="mt-2">
                    <input type="hidden" name="listId" value={list.id} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <Button variant="secondary">Clear the done ones</Button>
                  </form>
                </details>
              ) : null}
            </div>
          </Card>
        ) : (
          <Card title="No lists yet" icon={ListChecks} tint="teal">
            <p className="text-xl text-ink-muted">Make a list to start adding to-dos.</p>
          </Card>
        )}

        {/* Everything with a day, across all lists */}
        <Card title="By day" icon={CalendarDots} tint="purple">
          {dated.length === 0 ? (
            <p className="py-4 text-xl text-ink-muted">No to-dos with a day yet.</p>
          ) : (
            <ul className="flex flex-col lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
              {dated.map((t) => (
                <TodoRow
                  key={t.id}
                  todo={{ ...t, icon: t.icon ?? listById.get(t.list_id)?.icon ?? null }}
                  members={memberById}
                  today={today}
                  household={household}
                  returnTo={returnTo}
                />
              ))}
            </ul>
          )}
        </Card>
      </div>

      {editing ? (
        <Sheet title="Edit to-do" closeHref={returnTo}>
          <form action={updateTodo} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="id" value={editing.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <TodoFields members={members} lists={lists} todo={editing} showList />
            <div className="sm:col-span-2">
              <Button>Save</Button>
            </div>
          </form>
          <form action={removeTodo} className="mt-6">
            <input type="hidden" name="id" value={editing.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <Button variant="danger">Remove this to-do</Button>
          </form>
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
          <form action={removeList} className="mt-6">
            <input type="hidden" name="id" value={list.id} />
            <input type="hidden" name="name" value={list.name} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <Button variant="danger">Remove the list and its to-dos</Button>
          </form>
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
        <Input name="icon" defaultValue={icon ?? ""} maxLength={8} placeholder="📝" />
        <span className="text-sm text-ink-muted">One emoji.</span>
      </label>
    </>
  );
}
