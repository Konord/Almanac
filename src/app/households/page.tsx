import { Suspense } from "react";
import { ArrowLeft, CaretLeft, CaretRight, HouseLine, Plus, Trash } from "@phosphor-icons/react/dist/ssr";
import { AppFrame, Button, Card, Emoji, Field, IconLink, Input, Notice, ScreenHeader, Select, SoftLink, firstParam } from "@/components/ui";
import { requireHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { deleteHousehold, newHousehold, switchHousehold } from "./actions";

/**
 * Every household this login can open. Tap one to switch to it, make a
 * new one (a test household, say), or delete one you no longer need.
 * Six fit on a page; arrows page through the rest, so nothing scrolls.
 */
const PER_PAGE = 6;

export default function HouseholdsPage(props: PageProps<"/households">) {
  return (
    <AppFrame section="settings">
      <Suspense fallback={<p className="text-lg text-ink-muted">Loading…</p>}>
        <HouseholdsContent searchParams={props.searchParams} />
      </Suspense>
    </AppFrame>
  );
}

async function HouseholdsContent({ searchParams }: { searchParams: PageProps<"/households">["searchParams"] }) {
  await requireHousehold();
  const params = await searchParams;
  const supabase = await createClient();
  const { data: households, error } = await supabase.rpc("my_households");
  if (error) throw error;

  const pages = Math.max(1, Math.ceil(households.length / PER_PAGE));
  const page = Math.min(pages, Math.max(1, Number(firstParam(params.page)) || 1));
  const shown = households.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const error_ = firstParam(params.error);
  const message = firstParam(params.message);

  return (
    <>
      <ScreenHeader title="Households">
        <SoftLink href="/household" className="lg:ml-auto">
          <ArrowLeft size="1.5rem" aria-hidden />
          Back to settings
        </SoftLink>
      </ScreenHeader>

      {error_ ? <Notice tone="error">{error_}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}

      <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card
          title="Your households"
          icon={HouseLine}
          tint="orange"
          aside={
            pages > 1 ? (
              <div className="flex items-center gap-2">
                {page > 1 ? <IconLink href={`/households?page=${page - 1}`} label="Previous households" icon={CaretLeft} /> : null}
                <span className="text-base font-bold text-ink-muted">
                  {page} of {pages}
                </span>
                {page < pages ? <IconLink href={`/households?page=${page + 1}`} label="More households" icon={CaretRight} /> : null}
              </div>
            ) : null
          }
        >
          <p className="mb-4 text-lg text-ink-muted">Tap a household to switch this screen to it.</p>
          <ul className="grid gap-4 sm:grid-cols-2 lg:min-h-0 lg:flex-1 lg:grid-rows-3">
            {shown.map((h) => (
              <li key={h.id}>
                {h.is_current ? (
                  <div className="flex h-full min-h-24 items-center gap-5 rounded-[var(--radius-card)] border-2 border-accent bg-board px-5 py-3">
                    <Emoji emoji="🏡" className="size-16" />
                    <div className="min-w-0">
                      <p className="truncate text-3xl font-bold text-ink">{h.name}</p>
                      <p className="text-base font-bold text-accent">Showing now</p>
                    </div>
                  </div>
                ) : (
                  <form action={switchHousehold} className="h-full">
                    <input type="hidden" name="id" value={h.id} />
                    <button className="flex h-full min-h-24 w-full items-center gap-4 rounded-[var(--radius-card)] border border-frame bg-rail px-5 py-3 text-left hover:bg-panel">
                      <Emoji emoji="🏠" className="size-16" />
                      <span className="min-w-0">
                        <span className="block truncate text-3xl font-bold text-ink">{h.name}</span>
                        <span className="block text-base text-ink-muted">Tap to switch</span>
                      </span>
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <div className="flex flex-col gap-5 lg:min-h-0">
          <Card title="New household" icon={Plus} tint="green">
            <form action={newHousehold} className="mt-2 flex flex-col gap-4">
              <Field label="Name" hint="It starts with the usual starter routines, chores and meals.">
                <Input name="name" required maxLength={80} placeholder="Test house" />
              </Field>
              <div>
                <Button>Make and switch to it</Button>
              </div>
            </form>
          </Card>

          <Card title="Delete a household" icon={Trash} tint="pink">
            <form action={deleteHousehold} className="mt-2 flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Household">
                  <Select name="id" defaultValue="" required>
                    <option value="" disabled>
                      Choose…
                    </option>
                    {households.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Type its name to confirm">
                  <Input name="confirmName" required maxLength={80} autoComplete="off" />
                </Field>
              </div>
              <p className="text-base text-ink-muted">This removes its people, calendar, chores and meals for good.</p>
              <div>
                <Button variant="danger">Delete for good</Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
