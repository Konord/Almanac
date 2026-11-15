import type { ReactNode } from "react";
import Link from "next/link";
import { Check, UsersThree } from "@phosphor-icons/react/dist/ssr";
import { Avatar } from "@/components/ui";
import { soft, strong } from "@/lib/colours";
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
      aria-label={people.length === 0 ? "Showing everyone: choose people" : `Showing ${people.map((m) => m.name).join(", ")}: choose people`}
      className="inline-flex min-h-[var(--touch-target)] shrink-0 items-center justify-center gap-2 rounded-[var(--radius)] bg-panel px-4 text-lg font-bold text-ink"
    >
      {people.length === 0 ? (
        <>
          <UsersThree size="1.5rem" aria-hidden />
          Everyone
        </>
      ) : (
        <>
          {/* Glance: people are colour dots, not avatars. */}
          <span className="flex gap-1" aria-hidden>
            {people.slice(0, 4).map((m) => (
              <span key={m.id} className="size-3.5 rounded-full" style={{ background: strong(m.colour) }} />
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
