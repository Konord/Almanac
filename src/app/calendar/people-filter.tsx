import type { ReactNode } from "react";
import Link from "next/link";
import { Check, UsersThree } from "@phosphor-icons/react/dist/ssr";
import { Avatar } from "@/components/ui";
import { soft } from "@/lib/colours";
import { choosePeople } from "./actions";
import type { Member } from "./types";

/*
 * The person filter (it replaced tag overlays, Connor 2026-11-10): a screen
 * can show just some people's things, like a phone that only shows Mom's.
 * Events for everyone still show. On the Agenda, other people's columns
 * (and their routines) are hidden. Each screen remembers its own choice.
 */

/** The header button: who this screen shows, opening the chooser. */
export function PeopleButton({ members, shown, href }: { members: Member[]; shown: string[]; href: string }) {
  const people = members.filter((m) => shown.includes(m.id));
  return (
    <Link
      href={href}
      scroll={false}
      title="Whose things this screen shows"
      className="inline-flex min-h-[var(--touch-target)] shrink-0 items-center justify-center gap-2 rounded-2xl bg-rail px-4 text-base font-bold text-ink hover:bg-panel"
    >
      {people.length === 0 ? (
        <>
          <UsersThree size="1.5rem" aria-hidden />
          Everyone
        </>
      ) : (
        <>
          <span className="flex -space-x-2">
            {people.slice(0, 3).map((m) => (
              <Avatar key={m.id} name={m.name} colour={m.colour} icon={m.icon} size="sm" />
            ))}
          </span>
          <span className="max-w-[9rem] truncate">{people.length === 1 ? `Just ${people[0].name}` : `${people.length} people`}</span>
        </>
      )}
    </Link>
  );
}

/** Tap people to show or hide their things on this screen. */
export function PeopleChooser({
  members,
  shown,
  returnTo,
  returnPath,
}: {
  members: Member[];
  shown: string[];
  returnTo: string;
  returnPath: "/" | "/calendar";
}) {
  const everyone = shown.length === 0;
  const option = (id: string, on: boolean, body: ReactNode, colour?: string) => (
    <form key={id} action={choosePeople}>
      <input type="hidden" name="memberId" value={id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="returnPath" value={returnPath} />
      <button
        aria-pressed={on}
        className={`flex min-h-[var(--touch-target)] w-full items-center gap-3 rounded-2xl border-2 px-3 py-1.5 text-left text-lg font-bold text-ink ${
          on ? "border-ink" : "border-frame bg-board"
        }`}
        style={on && colour ? { background: soft(colour) } : undefined}
      >
        {body}
        {on ? <Check size="1.5rem" weight="bold" aria-hidden className="ml-auto shrink-0" /> : null}
      </button>
    </form>
  );
  return (
    <div className="flex flex-col gap-4">
      <p className="text-lg text-ink-muted">
        Show just some people&apos;s things on this screen. Things for everyone always show. Each screen remembers its own.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {option(
          "everyone",
          everyone,
          <>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-rail">
              <UsersThree size="1.5rem" aria-hidden />
            </span>
            Everyone
          </>,
        )}
        {members.slice(0, 11).map((m) =>
          option(
            m.id,
            !everyone && shown.includes(m.id),
            <>
              <Avatar name={m.name} colour={m.colour} icon={m.icon} />
              <span className="truncate">{m.name}</span>
            </>,
            m.colour,
          ),
        )}
      </div>
    </div>
  );
}
