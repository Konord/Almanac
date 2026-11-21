import { TimeField } from "@/components/touch-pickers";
import { Suspense } from "react";
import Link from "next/link";
import { Plus } from "@phosphor-icons/react/dist/ssr";
import {
  AppFrame,
  Button,
  Card,
  Emoji,
  EmptyState,
  Field,
  Input,
  LoadingOutline,
  Notice,
  ScreenHeader,
  firstParam,
  headerActionWidth,
  primaryActionClass,
} from "@/components/ui";
import { FitList } from "@/components/fit-list";
import { wallTime } from "@/lib/time-text";
import { EmojiPicker } from "@/components/emoji-picker";
import { requireHousehold } from "@/lib/household";
import { eventEmoji } from "@/lib/emoji";
import { lengthLabel } from "@/lib/quick-times";
import {
  newTemplate,
  removeTemplate,
  updateTemplate,
} from "../calendar/actions";
import { DayKindChips, LocationField } from "../calendar/forms";
import { LengthInput } from "../calendar/when-fields";
import { Stickers } from "../calendar/stickers";
import { loadCalendar } from "../calendar/data";
import type { DayKind, EventTemplate, Member } from "../calendar/types";

/**
 * Event templates (moved off the calendar into Settings, Connor
 * 2026-11-16). Rebuilt in the Glance style like Holidays (UI audit M5,
 * 2026-11-21): the list on the left, the one picked open on the right,
 * Add in the header. They can also be made from the add card ("Add and
 * save as a template") or an event's card ("Save as a template").
 */
export default function TemplatesPage(props: PageProps<"/templates">) {
  return (
    <AppFrame section="settings">
      <Suspense fallback={<LoadingOutline />}>
        <Templates searchParams={props.searchParams} />
      </Suspense>
    </AppFrame>
  );
}

async function Templates({
  searchParams,
}: {
  searchParams: PageProps<"/templates">["searchParams"];
}) {
  const household = await requireHousehold();
  const { locale } = household.settings;
  const params = await searchParams;
  // Templates, people and kinds of day come with the calendar's data (an empty range: no events needed).
  const now = new Date();
  const { members, templates, dayKinds } = await loadCalendar(now, now);
  const memberById = new Map(members.map((m) => [m.id, m]));
  // The one tapped, or the first, so the right side is never just a hint (UI audit M5).
  const editing =
    templates.find((t) => t.id === firstParam(params.tpl)) ?? templates[0];
  const error = firstParam(params.error);
  const message = firstParam(params.message);

  return (
    <>
      <ScreenHeader
        title="Templates"
        sub="for events"
        action={
          <form action={newTemplate}>
            <input type="hidden" name="returnPath" value="/templates" />
            <button
              type="submit"
              className={`${primaryActionClass} ${headerActionWidth}`}
            >
              <Plus size="1.25rem" weight="bold" aria-hidden />
              Add
            </button>
          </form>
        }
      />
      {error ? <Notice tone="error">{error}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}
      <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[30rem_minmax(0,1fr)]">
        {/* Left: every template; tap one to change it */}
        <Card>
          <FitList
            heading={
              <span className="flex items-baseline gap-3 text-[1.75rem]">
                Templates
                <span className="text-[1.25rem] font-semibold text-ink-muted tabular-nums">
                  {templates.length}
                </span>
              </span>
            }
            fallback={TEMPLATES_PAGE}
            focus={Math.max(
              0,
              templates.findIndex((t) => t.id === editing?.id),
            )}
            className="gap-1"
            empty={
              <p className="py-3 text-[1.25rem] font-bold text-ink-muted">
                No templates yet
              </p>
            }
            rows={templates.map((t) => {
              const active = t.id === editing?.id;
              const who = t.member_ids
                .map((id) => memberById.get(id)?.name)
                .filter(Boolean)
                .join(", ");
              const when = t.all_day
                ? "All day"
                : [
                    t.start_time ? wallTime(t.start_time, locale) : "",
                    lengthLabel(t.minutes),
                  ]
                    .filter(Boolean)
                    .join(" · ");
              return (
                <li key={t.id}>
                  <Link
                    href={`/templates?tpl=${t.id}`}
                    scroll={false}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-16 items-center gap-[0.7rem] rounded-[var(--radius)] px-3 py-1 ${active ? "bg-rail shadow-[inset_0_0_0_2px_var(--color-ink)]" : "hover:bg-rail"}`}
                  >
                    <Emoji
                      emoji={t.icon || eventEmoji(null, t.title)}
                      className="size-[2.15rem]"
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[1.5rem] leading-[1.15] font-extrabold text-ink">
                        {t.title}
                      </span>
                      <span className="tabular truncate text-[1.15rem] font-bold text-ink-muted">
                        {[when, who].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          />
        </Card>

        {/* Right: the one picked */}
        <Card>
          {editing ? (
            <TemplateCard
              key={editing.id}
              template={editing}
              members={members}
              dayKinds={dayKinds}
              returnTo="panel=templates"
            />
          ) : (
            <EmptyState
              emoji="📋"
              title="No templates yet"
              hint="Tap Add, or save an event as a template from its card."
            />
          )}
        </Card>
      </div>
    </>
  );
}

/** How many templates show before the list is measured (nothing scrolls; it pages when full). */
const TEMPLATES_PAGE = 10;

/** Changing a template: the same fields as the event card, without a date. One Save. */
function TemplateCard({
  template,
  members,
  dayKinds,
  returnTo,
}: {
  template: EventTemplate;
  members: Member[];
  dayKinds: DayKind[];
  returnTo: string;
}) {
  const back = `${returnTo}&tpl=${template.id}`;
  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      <form
        id="edit-template"
        action={updateTemplate}
        className="group grid min-h-0 flex-1 content-start gap-x-8 gap-y-5 xl:grid-cols-2"
      >
        <input type="hidden" name="id" value={template.id} />
        <input type="hidden" name="returnTo" value={back} />
        <input type="hidden" name="returnPath" value="/templates" />
        <div className="flex flex-col gap-5">
          <div className="flex gap-3">
            <EmojiPicker initial={template.icon ?? ""} />
            <div className="min-w-0 flex-1">
              <Field label="Name">
                <Input
                  name="title"
                  required
                  maxLength={120}
                  defaultValue={template.title}
                />
              </Field>
            </div>
          </div>
          <div className="flex items-end gap-3">
            <div className="min-w-0 flex-1 group-has-[input[name=allDay]:checked]:invisible">
              <Field label="Usually starts at">
                <TimeField
                  name="startTime"
                  defaultValue={template.start_time?.slice(0, 5) ?? ""}
                  allowEmpty
                  emptyText="No set time"
                  aria-label="Usually starts at"
                />
              </Field>
            </div>
            <label className="mb-7 flex min-h-[var(--touch-target)] shrink-0 cursor-pointer items-center gap-2 rounded-full border-2 border-frame bg-board px-4 text-lg text-ink select-none has-checked:border-ink has-checked:bg-rail has-checked:font-bold">
              <input
                type="checkbox"
                name="allDay"
                defaultChecked={template.all_day}
                className="size-5 accent-ink"
              />
              All day
            </label>
          </div>
          <div className="group-has-[input[name=allDay]:checked]:hidden">
            <LengthInput initial={template.minutes} />
          </div>
        </div>
        <div className="flex flex-col gap-5">
          <Stickers members={members} memberIds={template.member_ids} />
          <DayKindChips kinds={dayKinds} value={template.day_kind} />
          <LocationField value={template.location} />
          <Field label="Notes">
            <Input
              name="notes"
              maxLength={2000}
              defaultValue={template.notes ?? ""}
            />
          </Field>
        </div>
      </form>
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <Button form="edit-template" variant="save">
          Save
        </Button>
        <form action={removeTemplate} className="ml-auto">
          <input type="hidden" name="id" value={template.id} />
          <input type="hidden" name="name" value={template.title} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="returnPath" value="/templates" />
          <Button variant="danger">Delete</Button>
        </form>
      </div>
    </div>
  );
}
