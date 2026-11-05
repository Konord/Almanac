import { Suspense } from "react";
import { Button, Notice, firstParam } from "@/components/ui";
import { requireHousehold } from "@/lib/household";
import { localDateOf } from "@/lib/time";
import { addRoutine } from "../actions";
import { loadRoutines } from "../data";
import { Assignments, NavButton, RoutineFields, TemplateEditor } from "../sections";

/**
 * Setting routines up: who does which routine on which days, and each
 * routine's steps. Kept off the checklist so the wall screen stays simple.
 */
export default function ManageRoutinesPage(props: PageProps<"/routines/manage">) {
  return (
    // On a landscape screen each half scrolls on its own, so the page fits.
    <main className="mx-auto flex w-full max-w-[1920px] flex-1 flex-col gap-4 p-4 sm:p-6 lg:h-dvh lg:max-h-dvh lg:min-h-0 lg:overflow-hidden">
      <Suspense fallback={<p className="text-lg text-ink-muted">Loading…</p>}>
        <Manage searchParams={props.searchParams} />
      </Suspense>
    </main>
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
      <div className="flex flex-wrap items-center gap-2 border-b-4 border-marker-blue pb-3">
        <NavButton href="/">Home</NavButton>
        <NavButton href="/routines">Back to checklists</NavButton>
        <h1 className="text-3xl font-semibold tracking-tight text-ink sm:ml-2">Set up routines</h1>
      </div>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}

      <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-2">
        <section className="flex flex-col gap-3 lg:min-h-0 lg:overflow-y-auto lg:pr-2">
          <h2 className="text-2xl font-semibold text-ink">Who does which routine, when</h2>
          <Assignments data={data} household={household} date={today} returnTo={returnTo} />
        </section>

        <section className="flex flex-col gap-3 lg:min-h-0 lg:overflow-y-auto lg:pr-2">
          <h2 className="text-2xl font-semibold text-ink">Routines and their steps</h2>
          <p className="text-base text-ink-muted">
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
          <details className="rounded-[var(--radius)] border-2 border-frame bg-panel/60 p-4">
            <summary className="cursor-pointer text-lg font-semibold text-ink">+ Make a new routine</summary>
            <form action={addRoutine} className="mt-4 grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="returnTo" value={returnTo} />
              <RoutineFields />
              <div className="sm:col-span-2">
                <Button>Make routine</Button>
              </div>
            </form>
          </details>
        </section>
      </div>
    </>
  );
}
