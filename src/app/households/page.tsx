import { Pager } from "@/components/pager";
import { Suspense } from "react";
import { ArrowLeft, Plus, Trash } from "@phosphor-icons/react/dist/ssr";
import { AppFrame, Button, cardClass, Emoji, Field, Input, Notice, ScreenHeader, Select, SoftLink, firstParam, LoadingOutline } from "@/components/ui";
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
      <Suspense fallback={<LoadingOutline />}>
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
      <ScreenHeader
        title="Households"
        action={
          <SoftLink href="/household">
            <ArrowLeft size="1.5rem" aria-hidden />
            Back to settings
          </SoftLink>
        }
      />

      {error_ ? <Notice tone="error">{error_}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}

      <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section aria-label="Your households" className={`${cardClass} gap-4`}>
          <div className="flex shrink-0 items-center gap-3">
            <h2 className="flex min-w-0 flex-1 items-baseline gap-3 text-[1.75rem] font-bold text-ink">
              Your households <span className="text-[1.25rem] font-semibold text-ink-muted tabular-nums">{households.length}</span>
            </h2>
            <Pager page={page - 1} pages={pages} href={(n) => `/households?page=${n + 1}`} />
          </div>
          <p className="shrink-0 text-[1.25rem] font-bold text-ink-muted">Tap one to show it on this screen.</p>
          <ul className="grid gap-4 sm:grid-cols-2 lg:min-h-0 lg:flex-1 lg:grid-rows-3">
            {shown.map((h) => (
              <li key={h.id} className="min-h-0">
                {h.is_current ? (
                  <div className="flex h-full min-h-24 items-center gap-5 rounded-[var(--radius-card)] bg-rail px-5 py-3 shadow-[inset_0_0_0_2px_var(--color-ink)]">
                    <Emoji emoji="🏡" className="size-16" />
                    <div className="min-w-0">
                      <p className="truncate text-[2rem] leading-tight font-extrabold text-ink">{h.name}</p>
                      <p className="text-[1.25rem] font-bold text-ink-muted">Showing now</p>
                    </div>
                  </div>
                ) : (
                  <form action={switchHousehold} className="h-full">
                    <input type="hidden" name="id" value={h.id} />
                    <button className="flex h-full min-h-24 w-full items-center gap-5 rounded-[var(--radius-card)] border-2 border-frame bg-board px-5 py-3 text-left hover:border-ink">
                      <Emoji emoji="🏠" className="size-16" />
                      <span className="min-w-0">
                        <span className="block truncate text-[2rem] leading-tight font-extrabold text-ink">{h.name}</span>
                        <span className="block text-[1.25rem] font-bold text-ink-muted">Switch to it</span>
                      </span>
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>

        <div className="flex flex-col gap-5 lg:min-h-0">
          <section aria-label="New household" className={`${cardClass} gap-4`}>
            <h2 className="text-[1.75rem] font-bold text-ink">New household</h2>
            <form action={newHousehold} className="flex items-end gap-3">
              <div className="flex-1">
                <Field label="Name">
                  <Input name="name" required maxLength={80} />
                </Field>
              </div>
              <Button>
                <Plus size="1.25rem" weight="bold" aria-hidden />
                Make and switch to it
              </Button>
            </form>
          </section>

          <section aria-label="Delete a household" className={`${cardClass} gap-4`}>
            <h2 className="text-[1.75rem] font-bold text-ink">Delete a household</h2>
            <form action={deleteHousehold} className="flex flex-col gap-4">
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
              <p className="text-[1.25rem] font-semibold text-ink-muted">This removes its people, calendar, chores and meals for good.</p>
              <div className="flex justify-end">
                <Button variant="danger">
                  <Trash size="1.25rem" aria-hidden />
                  Delete for good
                </Button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}
