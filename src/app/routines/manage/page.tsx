import { Suspense } from "react";
import { ArrowLeft, CalendarCheck, ListChecks } from "@phosphor-icons/react/dist/ssr";
import { AppFrame, Button, Card, Notice, ScreenHeader, SoftLink, firstParam } from "@/components/ui";
import { requireHousehold } from "@/lib/household";
import { localDateOf } from "@/lib/time";
import { addRoutine } from "../actions";
import { loadRoutines } from "../data";
import { Assignments, RoutineFields, TemplateEditor } from "../sections";

/**
 * Setting routines up: who does which routine on which days, and each
 * routine's steps. Kept off the checklist so the wall screen stays simple.
 */
export default function ManageRoutinesPage(props: PageProps<"/routines/manage">) {
  return (
    // On a landscape screen each half scrolls on its own, so the page fits.
    <AppFrame section="routines">
      <Suspense fallback={<p className="text-lg text-ink-muted">Loading…</p>}>
        <Manage searchParams={props.searchParams} />
      </Suspense>
    </AppFrame>
  );
}

async function Manage({ searchParams }: { searchParams: PageProps<"/routines/manage">["searchParams"] }) {
  const household = await requireHousehold();
  const params = await searchParams;
  const today = localDateOf(new Date(), household.settings.timeZone);
  const data = await loadRoutines(today);
  const returnTo = "/routines/manage";
  const error = firstParam(params.error);
  const message = firstParam(params.message);

  return (
    <>
      <ScreenHeader title="Set up routines">
        <SoftLink href="/routines" className="lg:ml-auto">
          <ArrowLeft size="1.5rem" aria-hidden />
          Back to checklists
        </SoftLink>
      </ScreenHeader>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}

      <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-2">
        <Card title="Who does which routine, when" icon={CalendarCheck} tint="blue">
          <div className="mt-2 flex flex-col gap-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-2">
          <Assignments data={data} household={household} date={today} returnTo={returnTo} />
          </div>
        </Card>

        <Card title="Routines and their steps" icon={ListChecks} tint="teal">
          <div className="mt-2 flex flex-col gap-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-2">
          <p className="text-lg text-ink-muted">
            The ready-made routines are a starting point. Change the steps to suit your family. Essential steps are the
            ones kept on low-energy days.
          </p>
          {data.templates.map((t) => (
            <TemplateEditor
              key={t.id}
              template={t}
              steps={data.steps.filter((s) => s.template_id === t.id)}
              returnTo={returnTo}
              household={household}
            />
          ))}
          <details className="rounded-[var(--radius-card)] bg-rail p-4">
            <summary className="flex min-h-[var(--touch-target)] cursor-pointer items-center text-xl font-bold text-ink">+ Make a new routine</summary>
            <form action={addRoutine} className="mt-4 grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="returnTo" value={returnTo} />
              <RoutineFields />
              <div className="sm:col-span-2">
                <Button>Make routine</Button>
              </div>
            </form>
          </details>
          </div>
        </Card>
      </div>
    </>
  );
}
