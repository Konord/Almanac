import { TimeField } from "@/components/touch-pickers";
import { Suspense } from "react";
import Link from "next/link";
import { Trash } from "@phosphor-icons/react/dist/ssr";
import { AppFrame, Button, Card, Emoji, Field, Input, LoadingOutline, Notice, ScreenHeader, firstParam } from "@/components/ui";
import { Sheet } from "@/components/sheet";
import { EmojiPicker } from "@/components/emoji-picker";
import { requireHousehold } from "@/lib/household";
import { eventEmoji } from "@/lib/emoji";
import { lengthLabel } from "@/lib/quick-times";
import { removeTemplate, updateTemplate } from "../calendar/actions";
import { DayKindChips, LocationField } from "../calendar/forms";
import { CloseLink } from "../calendar/edit-event";
import { LengthInput } from "../calendar/when-fields";
import { Stickers } from "../calendar/stickers";
import { loadCalendar } from "../calendar/data";
import type { DayKind, EventTemplate, Member } from "../calendar/types";

/**
 * Event templates (moved off the calendar into Settings, Connor
 * 2026-11-16): the templates you've made, each with a way to remove it; tap
 * one to change it. New ones are still made on the add card ("Add and save
 * as a template") or an event's card ("Save as a template").
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

async function Templates({ searchParams }: { searchParams: PageProps<"/templates">["searchParams"] }) {
  await requireHousehold();
  const params = await searchParams;
  // Templates, people and kinds of day come with the calendar's data (an empty range: no events needed).
  const now = new Date();
  const { members, templates, dayKinds } = await loadCalendar(now, now);
  const memberById = new Map(members.map((m) => [m.id, m]));
  const editing = templates.find((t) => t.id === firstParam(params.tpl));
  const error = firstParam(params.error);
  const message = firstParam(params.message);

  return (
    <>
      <ScreenHeader title="Templates" sub="for events" />
      {error ? <Notice tone="error">{error}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}
      <Card>
        <TemplatesPanel templates={templates} memberById={memberById} returnTo="panel=templates" />
      </Card>
      {editing ? (
        <Sheet title="Edit template" closeHref="/templates" floating>
          <TemplateCard template={editing} members={members} dayKinds={dayKinds} returnTo="panel=templates" backHref="/templates" />
        </Sheet>
      ) : null}
    </>
  );
}

/** How many templates the page lists (nothing scrolls). */
const TEMPLATES_SHOWN = 16;

function TemplatesPanel({
  templates,
  memberById,
  returnTo,
}: {
  templates: EventTemplate[];
  memberById: Map<string, Member>;
  returnTo: string;
}) {
  const back = returnTo;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <section className="flex flex-col gap-3">
        {templates.length === 0 ? <p className="text-lg text-ink-muted">No templates yet.</p> : null}
        <ul className="grid grid-cols-3 gap-2">
          {templates.slice(0, TEMPLATES_SHOWN).map((t) => {
            const who = t.member_ids.map((id) => memberById.get(id)?.name).filter(Boolean).join(", ");
            const when = t.all_day ? "All day" : `${t.start_time ? `${t.start_time}, ` : ""}${lengthLabel(t.minutes)}`;
            return (
              <li key={t.id} className="flex items-center gap-2 rounded-[var(--radius)] border border-frame py-1 pr-1 pl-3">
                <Emoji emoji={t.icon || eventEmoji(null, t.title)} className="size-8" />
                <Link
                  href={`/templates?tpl=${t.id}`}
                  scroll={false}
                  title={`Edit the ${t.title} template`}
                  className="flex min-h-[var(--touch-target)] min-w-0 flex-1 flex-col justify-center"
                >
                  <span className="truncate text-lg font-bold text-ink">{t.title}</span>
                  <span className="truncate text-sm text-ink-muted">{[when, who, t.day_kind ? `Makes it a ${t.day_kind}` : ""].filter(Boolean).join(" · ")}</span>
                </Link>
                <form action={removeTemplate}>
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="name" value={t.title} />
                  <input type="hidden" name="returnTo" value={back} />
                  <input type="hidden" name="returnPath" value="/templates" />
                  <RemoveButton label={`Remove the ${t.title} template`} />
                </form>
              </li>
            );
          })}
        </ul>
        {templates.length > TEMPLATES_SHOWN ? <p className="text-base text-ink-muted">+ {templates.length - TEMPLATES_SHOWN} more</p> : null}
      </section>
    </div>
  );
}

function RemoveButton({ label }: { label: string }) {
  return (
    <button
      type="submit"
      aria-label={label}
      title={label}
      className="flex size-[var(--touch-target)] items-center justify-center rounded-full text-ink-muted hover:bg-rail hover:text-danger"
    >
      <Trash size="1.5rem" aria-hidden />
    </button>
  );
}

/** Changing a template: the same fields as the event card, without a date. One Save. */
function TemplateCard({
  template,
  members,
  dayKinds,
  returnTo,
  backHref,
}: {
  template: EventTemplate;
  members: Member[];
  dayKinds: DayKind[];
  returnTo: string;
  backHref: string;
}) {
  const back = `${returnTo}&tpl=${template.id}`;
  return (
    <div className="flex h-full flex-col gap-5">
      <form id="edit-template" action={updateTemplate} className="group flex min-h-0 flex-1 flex-col gap-5">
        <input type="hidden" name="id" value={template.id} />
        <input type="hidden" name="returnTo" value={back} />
        <input type="hidden" name="returnPath" value="/templates" />
        <div className="flex gap-3">
          <EmojiPicker initial={template.icon ?? ""} />
          <div className="min-w-0 flex-1">
            <Field label="Name">
              <Input name="title" required maxLength={120} defaultValue={template.title} />
            </Field>
          </div>
        </div>
        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1 group-has-[input[name=allDay]:checked]:invisible">
            <Field label="Usually starts at">
              <TimeField name="startTime" defaultValue={template.start_time?.slice(0, 5) ?? ""} allowEmpty emptyText="No set time" aria-label="Usually starts at" />
            </Field>
          </div>
          <label className="mb-7 flex min-h-[var(--touch-target)] shrink-0 cursor-pointer items-center gap-2 rounded-full border-2 border-frame bg-board px-4 text-lg text-ink select-none has-checked:border-ink has-checked:bg-rail has-checked:font-bold">
            <input type="checkbox" name="allDay" defaultChecked={template.all_day} className="size-5 accent-ink" />
            All day
          </label>
        </div>
        <div className="group-has-[input[name=allDay]:checked]:hidden">
          <LengthInput initial={template.minutes} />
        </div>
        <Stickers members={members} memberIds={template.member_ids} />
        <DayKindChips kinds={dayKinds} value={template.day_kind} />
        <LocationField value={template.location} />
        <Field label="Notes">
          <Input name="notes" maxLength={2000} defaultValue={template.notes ?? ""} />
        </Field>
      </form>
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <Button form="edit-template" variant="save">Save</Button>
        <CloseLink href={backHref} />
        <form action={removeTemplate} className="ml-auto">
          <input type="hidden" name="id" value={template.id} />
          <input type="hidden" name="name" value={template.title} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="returnPath" value="/templates" />
          <Button variant="danger">Delete template</Button>
        </form>
      </div>
    </div>
  );
}
