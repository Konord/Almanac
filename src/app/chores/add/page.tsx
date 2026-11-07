import { Suspense } from "react";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { AppFrame, Button, Card, Notice, ScreenHeader, SoftLink, firstParam } from "@/components/ui";
import { requireHousehold } from "@/lib/household";
import { localDateOf } from "@/lib/time";
import { addChore } from "../actions";
import { loadChores } from "../data";
import { ChoreFields } from "../forms";

/**
 * Adding a chore, on its own screen: what it is, when it comes back,
 * when in the year it's allowed, and the rest, on tabs so nothing scrolls.
 * Once added it runs by itself and shows in the lists on Chores.
 */
export default function AddChorePage(props: PageProps<"/chores/add">) {
  return (
    <AppFrame section="chores">
      <Suspense fallback={<p className="text-lg text-ink-muted">Loading…</p>}>
        <AddChore searchParams={props.searchParams} />
      </Suspense>
    </AppFrame>
  );
}

async function AddChore({ searchParams }: { searchParams: PageProps<"/chores/add">["searchParams"] }) {
  const household = await requireHousehold();
  const params = await searchParams;
  const { members } = await loadChores(localDateOf(new Date(), household.settings.timeZone), household.settings.timeZone);
  const error = firstParam(params.error);
  const message = firstParam(params.message);

  return (
    <>
      <ScreenHeader title="Add a chore">
        <div className="flex flex-wrap gap-3 lg:ml-auto">
          <SoftLink href="/chores">
            <ArrowLeft size="1.5rem" aria-hidden />
            Back to chores
          </SoftLink>
        </div>
      </ScreenHeader>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}

      <Card title="New chore" className="lg:min-h-0 lg:flex-1 lg:w-full lg:max-w-[64rem] lg:self-center">
        <form action={addChore} className="group flex min-h-0 flex-1 flex-col gap-5 pt-2">
          <input type="hidden" name="returnTo" value="/chores/add" />
          <input type="hidden" name="doneTo" value="/chores" />
          <div className="flex min-h-0 flex-1 flex-col">
            <ChoreFields members={members} />
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Button>Add chore</Button>
            <SoftLink href="/chores">Cancel</SoftLink>
          </div>
        </form>
      </Card>
    </>
  );
}
