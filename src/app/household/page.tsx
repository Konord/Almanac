import { Suspense } from "react";
import Link from "next/link";
import { Button, Field, Input, Notice, PageShell, Panel, Select, firstParam } from "@/components/ui";
import { requireHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import { addMember, removeMember, saveSettings, setPin, updateMember } from "./actions";
import { MEMBER_COLOURS, MEMBER_COLOUR_CLASS } from "@/lib/colours";

export default function HouseholdPage(props: PageProps<"/household">) {
  return (
    <PageShell title="Household">
      <Suspense fallback={<p className="text-lg text-ink-muted">Loading…</p>}>
        <HouseholdContent searchParams={props.searchParams} />
      </Suspense>
    </PageShell>
  );
}

type Member = {
  id: string;
  name: string;
  role: string;
  colour: string;
  birth_year: number | null;
  hasPin: boolean;
};

async function HouseholdContent({ searchParams }: { searchParams: PageProps<"/household">["searchParams"] }) {
  const household = await requireHousehold();
  const params = await searchParams;
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("members")
    .select("id, name, role, colour, birth_year")
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
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-2xl text-ink">{household.name}</p>
        <div className="flex gap-3">
          <Link
            href="/"
            className="inline-flex min-h-[var(--touch-target)] items-center rounded-[var(--radius)] border-2 border-frame bg-board px-5 text-lg text-ink"
          >
            Home
          </Link>
          <form action={signOut}>
            <Button variant="secondary">Sign out</Button>
          </form>
        </div>
      </div>

      {error_ ? <Notice tone="error">{error_}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}

      <Panel title="People">
        {members.length === 0 ? (
          <p className="mb-4 text-lg text-ink-muted">No one yet. Add the first person below.</p>
        ) : (
          <ul className="mb-6 flex flex-col gap-4">
            {members.map((member) => (
              <li key={member.id} className="rounded-[var(--radius)] border-2 border-frame bg-board p-4">
                <MemberEditor member={member} />
              </li>
            ))}
          </ul>
        )}

        <h3 className="mb-3 text-xl font-semibold text-ink">Add someone</h3>
        <form action={addMember} className="grid gap-4 sm:grid-cols-2">
          <MemberFields />
          <div className="sm:col-span-2">
            <Button>Add</Button>
          </div>
        </form>
      </Panel>

      <Panel title="Settings">
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
          <div className="sm:col-span-2">
            <Button>Save settings</Button>
          </div>
        </form>
      </Panel>

      <Panel title="Recent activity">
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
      </Panel>
    </div>
  );
}

function MemberEditor({ member }: { member: Member }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className={`size-6 rounded-full ${MEMBER_COLOUR_CLASS[member.colour] ?? "bg-marker-black"}`} />
        <span className="text-xl font-semibold text-ink">{member.name}</span>
        <span className="text-base text-ink-muted">
          {member.role === "parent" ? "Parent" : "Child"}
          {member.role === "parent" ? (member.hasPin ? " · PIN set" : " · no PIN yet") : ""}
        </span>
      </div>

      <details>
        <summary className="cursor-pointer text-base text-marker-blue">Edit</summary>
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
      <Field label="Name">
        <Input name="name" defaultValue={member?.name} required maxLength={40} />
      </Field>
      <Field label="Role">
        <Select name="role" defaultValue={member?.role ?? "parent"}>
          <option value="parent">Parent</option>
          <option value="child">Child</option>
        </Select>
      </Field>
      <Field label="Colour">
        <Select name="colour" defaultValue={member?.colour ?? "marker-blue"}>
          {MEMBER_COLOURS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
      </Field>
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
