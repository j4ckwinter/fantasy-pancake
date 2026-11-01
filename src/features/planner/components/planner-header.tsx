import Image from "next/image";
import Link from "next/link";
import type { Data } from "@/lib/schemas";
export function PlannerHeader({ data }: { data: Data | null }) {
  const nextEvent = data?.bootstrap.events.find((event) => event.is_next);
  const deadline = nextEvent
    ? new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/London",
        timeZoneName: "short",
      }).format(new Date(nextEvent.deadline_time))
    : null;

  return (
    <header className="brand">
      <Link className="brand-name" href="/" aria-label="Fantasy Pancake home">
        <Image
          className="brand-mark"
          src="/fantasy-pancake.svg"
          width={44}
          height={44}
          alt=""
          unoptimized
        />
        <span>
          Fantasy Pancake<small>Your next move, planned.</small>
        </span>
      </Link>
      <div className="header-tools">
        {nextEvent && deadline && (
          <div className="deadline">
            <span>GW{nextEvent.id} DEADLINE</span>
            <time dateTime={nextEvent.deadline_time}>{deadline}</time>
          </div>
        )}
        <a
          className="header-fpl"
          href="https://fantasy.premierleague.com/"
          target="_blank"
          rel="noreferrer"
        >
          Open FPL <span aria-hidden="true">↗</span>
        </a>
      </div>
    </header>
  );
}
