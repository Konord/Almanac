import { Suspense } from "react";
import { GearSix, HouseLine, SignOut, UsersThree, ClockCounterClockwise } from "@phosphor-icons/react/dist/ssr";
import { AppFrame, Avatar, Button, Card, Field, Input, Notice, ScreenHeader, Select, SoftLink, firstParam } from "@/components/ui";
import { requireHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import { addMember, removeMember, saveSettings, setPin, updateMember } from "./actions";
import { PERSON_COLOURS, strong } from "@/lib/colours";
import { EmojiPicker } from "@/components/emoji-picker";

export default function HouseholdPage(props: PageProps<"/household">) {
  return (
    <AppFrame section="settings">
      <Suspense fallback={<p className="text-lg text-ink-muted">Loading…</p>}>
        <HouseholdContent searchParams={props.searchParams} />
      </Suspense>
    </AppFrame>
  );
}

type Member = {
  id: string;
  name: string;
  role: string;
  colour: string;
  icon: string | null;
  birth_year: number | null;
  hasPin: boolean;
};

async function HouseholdContent({ searchParams }: { searchParams: PageProps<"/household">["searchParams"] }) {
  const household = await requireHousehold();
  const params = await searchParams;
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("members")
    .select("id, name, role, colour, icon, birth_year")
    .order("role", { ascending: false }) // parents first
    .order("sort_order")
    .order("name");
  if (error) throw error;

  const members: Member[] = await Promise.all(
    rows.map(async (row) => {
      const { data: hasPin } = await supabase.rpc("member_has_pin", { member_id: row.id });
      return { ...row, hasPin: Boolean(hasPin) };
    }),
  );

  const { data: activity } = await supabase
    .from("activity_log")
    .select("id, at, action, details")
    .order("at", { ascending: false })
    .limit(10);

  const error_ = firstParam(params.error);
  const message = firstParam(params.message);
  const { settings } = household;

  return (
    <>
      <ScreenHeader title="Settings">
        <span className="min-w-0 truncate text-2xl text-ink-muted lg:text-4xl">{household.name}</span>
        <SoftLink href="/households" className="lg:ml-auto">
          <HouseLine size="1.5rem" aria-hidden />
          Switch or add household
        </SoftLink>
        <form action={signOut}>
          <Button variant="secondary">
            <SignOut size="1.5rem" aria-hidden />
            Sign out
          </Button>
        </form>
      </ScreenHeader>

      {error_ ? <Notice tone="error">{error_}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}

      <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card title="People" icon={UsersThree} tint="blue">
        <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-2">
        {members.length === 0 ? (
          <p className="mb-4 text-lg text-ink-muted">No one yet. Add the first person below.</p>
        ) : (
          <ul className="mb-6 flex flex-col gap-4">
            {members.map((member) => (
              <li key={member.id} className="border-b border-frame py-3 last:border-0">
                <MemberEditor member={member} />
              </li>
            ))}
          </ul>
        )}

        <details className="rounded-[var(--radius-card)] bg-rail p-4">
          <summary className="flex min-h-[var(--touch-target)] cursor-pointer items-center text-xl font-bold text-ink">Add someone</summary>
          <form action={addMember} className="mt-2 grid gap-4 sm:grid-cols-2">
            <MemberFields />
            <div className="sm:col-span-2">
              <Button>Add</Button>
            </div>
          </form>
        </details>
        </div>
      </Card>

      <Card title="Household" icon={GearSix} tint="slate">
        <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-2">
        <form action={saveSettings} className="grid gap-4 sm:grid-cols-2">
          <Field label="Household name">
            <Input name="householdName" defaultValue={household.name} required maxLength={80} />
          </Field>
          <Field label="Time zone" hint="For example, America/Toronto.">
            <Input name="timeZone" defaultValue={settings.timeZone} required />
          </Field>
          <Field label="Week starts on">
            <Select name="weekStartsOn" defaultValue={String(settings.weekStartsOn)}>
              <option value="0">Sunday</option>
              <option value="1">Monday</option>
            </Select>
          </Field>
          <Field label="The Month view shows">
            <Select name="monthStyle" defaultValue={settings.monthStyle}>
              <option value="rolling">5 weeks from this week</option>
              <option value="calendar">The calendar month</option>
            </Select>
          </Field>
          <Field label="Weekly review on" hint="A reminder shows on the Agenda from then until the next week is confirmed.">
            <Select name="reviewWeekday" defaultValue={String(settings.weeklyReview.weekday)}>
              {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, i) => (
                <option key={day} value={i}>
                  {day}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Weekly review at">
            <Input name="reviewTime" type="time" defaultValue={settings.weeklyReview.time} required />
          </Field>
          <Field label="Currency">
            <Input name="currency" defaultValue={settings.currency} required maxLength={3} />
          </Field>
          <Field label="Units">
            <Select name="units" defaultValue={settings.units}>
              <option value="metric">Metric</option>
              <option value="imperial">Imperial</option>
            </Select>
          </Field>
          <Field label="Temperature">
            <Select name="temperatureUnit" defaultValue={settings.temperatureUnit}>
              <option value="celsius">Celsius</option>
              <option value="fahrenheit">Fahrenheit</option>
            </Select>
          </Field>
          <label className="flex min-h-[var(--touch-target)] items-center gap-3 text-lg text-ink sm:col-span-2">
            <input type="checkbox" name="handwriting" defaultChecked={settings.handwriting} className="size-6 accent-accent" />
            <span>
              Show to-dos, meals and notes in <span className="font-hand text-xl font-bold">handwriting</span>
            </span>
          </label>
          <fieldset className="grid gap-4 rounded-[var(--radius-card)] border border-frame p-4 sm:col-span-2 sm:grid-cols-3">
            <legend className="px-2 text-lg font-bold text-ink">Free and busy days</legend>
            <p className="text-base text-ink-muted sm:col-span-3">
              The Today screen calls a day free or busy from the events in it. Only time between the start and end of
              the day counts, and only layers set to count toward busy.
            </p>
            <Field label="Day starts">
              <Input name="dayStarts" type="time" defaultValue={settings.dayProfile.dayStarts} required />
            </Field>
            <Field label="Evening starts">
              <Input name="eveningStarts" type="time" defaultValue={settings.dayProfile.eveningStarts} required />
            </Field>
            <Field label="Day ends">
              <Input name="dayEnds" type="time" defaultValue={settings.dayProfile.dayEnds} required />
            </Field>
            <Field label="Busy day after (hours of events)">
              <Input
                name="busyDayHours"
                type="number"
                min="0.25"
                max="24"
                step="0.25"
                defaultValue={settings.dayProfile.busyDayMinutes / 60}
                required
              />
            </Field>
            <Field label="Busy evening after (hours)">
              <Input
                name="busyEveningHours"
                type="number"
                min="0.25"
                max="24"
                step="0.25"
                defaultValue={settings.dayProfile.busyEveningMinutes / 60}
                required
              />
            </Field>
          </fieldset>
          <div className="sm:col-span-2">
            <Button>Save settings</Button>
          </div>
        </form>

        <h3 className="mt-8 mb-2 flex items-center gap-2 text-2xl font-bold text-ink">
          <ClockCounterClockwise size="1.75rem" aria-hidden className="text-ink-muted" />
          Recent activity
        </h3>
        {activity && activity.length > 0 ? (
          <ul className="flex flex-col gap-2 text-base text-ink">
            {activity.map((entry) => (
              <li key={entry.id} className="flex justify-between gap-4 border-b border-frame pb-2 last:border-0">
                <span>{describeActivity(entry.action, entry.details)}</span>
                <span className="shrink-0 text-ink-muted">
                  {new Intl.DateTimeFormat(settings.locale, {
                    timeZone: settings.timeZone,
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(entry.at))}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-lg text-ink-muted">Nothing yet.</p>
        )}
        </div>
      </Card>
      </div>
    </>
  );
}

function MemberEditor({ member }: { member: Member }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Avatar name={member.name} colour={member.colour} icon={member.icon} />
        <span className="text-xl font-bold text-ink">{member.name}</span>
        <span className="text-base text-ink-muted">
          {member.role === "parent" ? "Parent" : "Child"}
          {member.role === "parent" ? (member.hasPin ? " · PIN set" : " · no PIN yet") : ""}
        </span>
      </div>

      <details>
        <summary className="flex min-h-[var(--touch-target)] cursor-pointer items-center text-lg font-bold text-accent">Edit</summary>
        <form action={updateMember} className="mt-4 grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="id" value={member.id} />
          <MemberFields member={member} />
          <div className="sm:col-span-2">
            <Button>Save</Button>
          </div>
        </form>

        {member.role === "parent" ? (
          <form action={setPin} className="mt-6 grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="id" value={member.id} />
            <Field label={member.hasPin ? "New PIN" : "PIN"} hint="4 to 8 digits. Used for parent mode later.">
              <Input name="pin" type="password" inputMode="numeric" pattern="\d{4,8}" autoComplete="off" required />
            </Field>
            <Field label="Type it again">
              <Input name="confirmPin" type="password" inputMode="numeric" pattern="\d{4,8}" autoComplete="off" required />
            </Field>
            <div className="sm:col-span-2">
              <Button variant="secondary">{member.hasPin ? "Change PIN" : "Set PIN"}</Button>
            </div>
          </form>
        ) : null}

        <form action={removeMember} className="mt-6">
          <input type="hidden" name="id" value={member.id} />
          <input type="hidden" name="name" value={member.name} />
          <Button variant="danger">Remove {member.name}</Button>
        </form>
      </details>
    </div>
  );
}

function MemberFields({ member }: { member?: Member }) {
  return (
    <>
      <div className="flex gap-3">
        <EmojiPicker initial={member?.icon ?? ""} nameField="name" letter fullScreen />
        <div className="min-w-0 flex-1">
          <Field label="Name" hint="Tap the circle to give them a picture instead of a letter.">
            <Input name="name" defaultValue={member?.name} required maxLength={40} />
          </Field>
        </div>
      </div>
      <Field label="Role">
        <Select name="role" defaultValue={member?.role ?? "parent"}>
          <option value="parent">Parent</option>
          <option value="child">Child</option>
        </Select>
      </Field>
      <fieldset className="flex flex-col gap-1.5 sm:col-span-2">
        <legend className="mb-1.5 text-base font-bold text-ink">Colour</legend>
        <div className="flex flex-wrap gap-2">
          {PERSON_COLOURS.map((c) => (
            <label key={c.value} className="cursor-pointer" title={c.label}>
              <input
                type="radio"
                name="colour"
                value={c.value}
                defaultChecked={(member?.colour ?? "blue") === c.value}
                className="peer sr-only"
                required
              />
              <span
                className="flex size-[var(--touch-target)] items-center justify-center rounded-full ring-ink ring-offset-2 peer-checked:ring-4 peer-focus-visible:ring-4"
                style={{ background: strong(c.value) }}
              >
                <span className="sr-only">{c.label}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Birth year" hint="Optional.">
        <Input name="birthYear" type="number" min={1900} max={2100} defaultValue={member?.birth_year ?? undefined} />
      </Field>
    </>
  );
}

function describeActivity(action: string, details: unknown): string {
  const name =
    details && typeof details === "object" && "name" in details && typeof details.name === "string"
      ? details.name
      : "";
  switch (action) {
    case "household_created":
      return "Household created";
    case "member_added":
      return `Added ${name}`;
    case "member_updated":
      return `Updated ${name}`;
    case "member_removed":
      return `Removed ${name}`;
    case "member_pin_set":
      return "A parent PIN was set";
    case "settings_updated":
      return "Settings changed";
    default:
      return action.replaceAll("_", " ");
  }
}
