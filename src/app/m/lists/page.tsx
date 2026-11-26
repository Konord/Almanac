import { Suspense } from "react";
import { firstParam } from "@/components/ui";
import { requireHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { localDateOf } from "@/lib/time";
import { onItsList } from "@/lib/todos";
import { loadTodos } from "../../chores/data";
import { PhoneLoading } from "../page";
import { PhoneLists } from "./view";

/** The to-do lists on the phone, to tick things off. ?list=<id> opens one. */
export default function PhoneListsPage(props: PageProps<"/m/lists">) {
  return (
    <Suspense fallback={<PhoneLoading />}>
      <Lists searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Lists({ searchParams }: { searchParams: PageProps<"/m/lists">["searchParams"] }) {
  const params = await searchParams;
  const household = await requireHousehold();
  const today = localDateOf(new Date(), household.settings.timeZone);
  const supabase = await createClient();
  const [{ lists, todos }, members] = await Promise.all([loadTodos({ adults: true }), supabase.from("members").select("id, name, colour, icon").order("role", { ascending: false }).order("name")]);
  if (members.error) throw members.error;
  // The grocery list has its own tab; chores made by the chore planner live on the Daily List.
  const shown = lists.filter((l) => !l.is_groceries);
  const asked = firstParam(params.list);
  return (
    <PhoneLists
      lists={shown.map(({ id, name, icon, is_chores }) => ({ id, name, icon, isChores: is_chores }))}
      todos={todos
        .filter(onItsList)
        .filter((t) => t.status !== "skipped")
        .map((t) => ({ id: t.id, listId: t.list_id, title: t.title, icon: t.icon, dueDate: t.due_date, assigneeId: t.assignee_id, done: t.status === "done" }))}
      members={members.data}
      initialList={shown.find((l) => l.id === asked)?.id ?? shown.find((l) => !l.is_chores)?.id ?? shown[0]?.id ?? null}
      today={today}
      locale={household.settings.locale}
    />
  );
}
