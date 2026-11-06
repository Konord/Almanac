import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, Plus } from "@phosphor-icons/react/dist/ssr";
import { AppFrame, Avatar, Button, Card, Chips, Emoji, Field, Input, Notice, ScreenHeader, Select, SoftLink, firstParam } from "@/components/ui";
import { EmojiPicker } from "@/components/emoji-picker";
import { Sheet } from "@/components/sheet";
import { weekdaysLabel, type ChoreBlock } from "@/lib/chore-blocks";
import { requireHousehold } from "@/lib/household";
import { localDateOf, zonedToUtc } from "@/lib/time";
import { CardTabs, LengthControl } from "../../calendar/quick-controls";
import { shortTime } from "../../calendar/views";
import { Pager, pageOf } from "../../meals/parts";
import { addBlock, addExampleBlocks, removeBlock, updateBlock } from "../actions";
import { loadBlocks } from "../blocks";
import { loadChores, type ChoreMember, type ChoreWithTiming } from "../data";

/** Blocks shown at once: two rows of three. */
const PER_PAGE = 6;
/** Chores an open block can always include. */
const PRESET_SLOTS = 4;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Monday first, like the rest of the week pickers. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/**
 * Chore time: the blocks set aside for chores each week, like "Big clean,
 * Saturday 10 a.m.". Chores that come due fill them; see src/lib/chore-blocks.ts.
 */
export default function ChoreBlocksPage(props: PageProps<"/chores/blocks">) {
  return (
    <AppFrame section="chores">
      <Suspense fallback={<p className="text-lg text-ink-muted">Loading…</p>}>
        <Blocks searchParams={props.searchParams} />
      </Suspense>
    </AppFrame>
  );
}

async function Blocks({ searchParams }: { searchParams: PageProps<"/chores/blocks">["searchParams"] }) {
  const household = await requireHousehold();
  const params = await searchParams;
  const today = localDateOf(new Date(), household.settings.timeZone);
  const [blocks, { chores, members }] = await Promise.all([loadBlocks(), loadChores(today, household.settings.timeZone)]);
  const choreById = new Map(chores.map((c) => [c.id, c]));
  const memberById = new Map(members.map((m) => [m.id, m]));
  const page = pageOf(blocks, Number(firstParam(params.page) ?? 0), PER_PAGE);
  const editing = blocks.find((b) => b.id === firstParam(params.edit));
  const adding = firstParam(params.add) === "1";
  const error = firstParam(params.error);
  const message = firstParam(params.message);
  const returnTo = "/chores/blocks";
  const time = (t: string) => shortTime(zonedToUtc(today, t, household.settings.timeZone), household);

  return (
    <>
      <ScreenHeader title="Chore time">
        <div className="flex flex-wrap gap-3 lg:ml-auto">
          <SoftLink href="/chores/blocks?add=1">
            <Plus size="1.5rem" aria-hidden />
            Add chore time
          </SoftLink>
          <SoftLink href="/chores">
            <ArrowLeft size="1.5rem" aria-hidden />
            Back to chores
          </SoftLink>
        </div>
      </ScreenHeader>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}

      <p className="shrink-0 text-lg text-ink-muted">
        Time set aside for chores. It floats around plans like a routine. Closed time is for one chore (like Laundry). Open time
        always includes its chosen chores, and fills the rest with chores that are due.
      </p>

      {blocks.length === 0 ? (
        <Card title="No chore time yet" icon={Plus} tint="orange">
          <p className="text-xl text-ink-muted">
            Without it, chores that come due go on the to-do list, a few at a time. Set some time aside and they go there instead.
          </p>
          <form action={addExampleBlocks} className="mt-4">
            <input type="hidden" name="returnTo" value={returnTo} />
            <Button>Start with Laundry on Monday, Odd jobs on Wednesday and a Big clean on Saturday</Button>
          </form>
        </Card>
      ) : (
        <div className="grid content-start gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-3">
          {page.items.map((b) => (
            <Link
              key={b.id}
              href={`/chores/blocks?edit=${b.id}${page.page ? `&page=${page.page}` : ""}`}
              scroll={false}
              className="flex min-h-0 flex-col gap-2 rounded-[var(--radius-card)] border border-frame bg-board p-5 hover:bg-rail"
            >
              <span className="flex items-center gap-3">
                <Emoji emoji={b.icon ?? "🧹"} className="size-10" />
                <span className="min-w-0 flex-1 truncate text-2xl font-extrabold text-ink">{b.name}</span>
                <span className="flex -space-x-2">
                  {b.member_ids.flatMap((id) => {
                    const m = memberById.get(id);
                    return m ? [<Avatar key={id} name={m.name} colour={m.colour} icon={m.icon} size="sm" />] : [];
                  })}
                </span>
              </span>
              <span className="text-lg font-semibold text-ink">
                {weekdaysLabel(b.weekdays)} · {time(b.start_time)} · {b.minutes} min{b.loose ? " · loose" : ""}
              </span>
              <span className="line-clamp-2 text-base text-ink-muted">{blockChores(b, choreById)}</span>
            </Link>
          ))}
        </div>
      )}
      <Pager page={page.page} pages={page.pages} href={(n) => `/chores/blocks?page=${n}`} />

      {adding ? (
        <Sheet title="Add chore time" closeHref="/chores/blocks">
          <form action={addBlock} className="group flex h-full flex-col gap-5">
            <input type="hidden" name="returnTo" value={returnTo} />
            <BlockFields chores={chores} members={members} />
            <div className="shrink-0">
              <Button>Add chore time</Button>
            </div>
          </form>
        </Sheet>
      ) : null}

      {editing ? (
        <Sheet title={editing.name} closeHref="/chores/blocks">
          <div className="flex h-full flex-col gap-5">
            <form id="edit-block" action={updateBlock} className="group flex min-h-0 flex-1 flex-col">
              <input type="hidden" name="id" value={editing.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <BlockFields block={editing} chores={chores} members={members} />
            </form>
            <div className="flex shrink-0 gap-3">
              <Button form="edit-block">Save</Button>
              <form action={removeBlock} className="ml-auto">
                <input type="hidden" name="id" value={editing.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <Button variant="danger">Remove</Button>
              </form>
            </div>
          </div>
        </Sheet>
      ) : null}
    </>
  );
}

/** "Just Laundry" or "Always: Vacuum. Then whatever's due." */
function blockChores(b: ChoreBlock, choreById: Map<string, ChoreWithTiming>): string {
  if (b.kind === "closed") return `Just ${choreById.get(b.chore_id ?? "")?.name ?? "one chore"}.`;
  const presets = b.presets.map((id) => choreById.get(id)?.name).filter(Boolean);
  return presets.length > 0 ? `Always: ${presets.join(", ")}. Then whatever's due.` : "Whatever's due.";
}

/** The fields for a chore block, on tabs: when, which chores, and who. */
function BlockFields({ block, chores, members }: { block?: ChoreBlock; chores: ChoreWithTiming[]; members: ChoreMember[] }) {
  const choreOptions = chores.filter((c) => c.active);
  return (
    <CardTabs
      tabs={[
        {
          label: "When",
          panel: (
            <>
              <div className="flex gap-3">
                <EmojiPicker initial={block?.icon ?? ""} nameField="name" />
                <div className="min-w-0 flex-1">
                  <Field label="Name">
                    <Input name="name" defaultValue={block?.name} required maxLength={40} placeholder="Big clean" />
                  </Field>
                </div>
              </div>
              <Chips
                name="weekdays"
                label="Days"
                multiple
                defaultValue={(block?.weekdays ?? [6]).map(String)}
                options={WEEK_ORDER.map((d) => ({ value: String(d), label: WEEKDAYS[d] }))}
              />
              <div className="flex items-end gap-4">
                <Field label="Starts about">
                  <Input name="startTime" type="time" step={900} defaultValue={block?.start_time ?? "10:00"} required />
                </Field>
                <div className="min-w-0 flex-1">
                  <LengthControl initial={block?.minutes ?? 60} />
                </div>
              </div>
            </>
          ),
        },
        {
          label: "Chores",
          panel: (
            <>
              <Chips
                name="kind"
                label="What goes in it"
                defaultValue={block?.kind ?? "open"}
                options={[
                  { value: "open", label: "Open: chores that are due fill it" },
                  { value: "closed", label: "Closed: just one chore" },
                ]}
              />
              <div className="hidden group-has-[input[name=kind][value=closed]:checked]:block">
                <Field label="The chore">
                  <Select name="choreId" defaultValue={block?.chore_id ?? ""}>
                    <option value="">Pick one</option>
                    {choreOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4 group-has-[input[name=kind][value=closed]:checked]:hidden">
                <p className="col-span-2 text-base text-ink-muted">Chores it always includes (optional). The rest of the time fills with what&apos;s due.</p>
                {Array.from({ length: PRESET_SLOTS }, (_, i) => (
                  <Select key={i} name="presets" aria-label={`Always includes, ${i + 1}`} defaultValue={block?.presets[i] ?? ""}>
                    <option value="">Nothing</option>
                    {choreOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                ))}
              </div>
            </>
          ),
        },
        {
          label: "Who",
          panel: (
            <>
              <Chips
                name="memberIds"
                label="Who's free for it (it shows in their column)"
                multiple
                defaultValue={block?.member_ids ?? []}
                options={members.map((m) => ({ value: m.id, label: m.name }))}
              />
              <label className="flex min-h-[var(--touch-target)] cursor-pointer items-center gap-3 text-lg text-ink">
                <input type="checkbox" name="loose" defaultChecked={block?.loose} className="size-6 accent-ink" />
                Loose: it can move as far as it needs to (otherwise about an hour either way)
              </label>
            </>
          ),
        },
      ]}
    />
  );
}

