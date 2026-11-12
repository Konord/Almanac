import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Button, Field, Input, Notice, PageShell, Panel, firstParam } from "@/components/ui";
import { getHousehold } from "@/lib/household";
import { createHousehold } from "./actions";

export default function SetupPage(props: PageProps<"/setup">) {
  return (
    <PageShell title="Welcome to Almanac">
      <Suspense>
        <SetupForm searchParams={props.searchParams} />
      </Suspense>
    </PageShell>
  );
}

async function SetupForm({ searchParams }: { searchParams: PageProps<"/setup">["searchParams"] }) {
  // Already set up? Nothing to do here.
  if (await getHousehold()) redirect("/household");

  const error = firstParam((await searchParams).error);
  return (
    <Panel title="Name your household">
      {error ? <Notice tone="error">{error}</Notice> : null}
      <form action={createHousehold} className="mt-4 flex flex-col gap-4">
        <Field label="Household name">
          <Input name="name" required maxLength={80} />
        </Field>
        <div>
          <Button>Create household</Button>
        </div>
      </form>
    </Panel>
  );
}
