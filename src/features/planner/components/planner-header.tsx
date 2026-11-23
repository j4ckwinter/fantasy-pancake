import Image from "next/image";
import { ArrowUpRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { Data } from "@/lib/schemas";
import "./planner-header.css";
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
        <span className="brand-name__text">
          Fantasy Pancake<small>Your next move, planned.</small>
        </span>
      </Link>
      <div className="header-tools">
        {nextEvent && deadline && (
          <div className="deadline">
            <span className="deadline__label">GW{nextEvent.id} deadline</span>
            <time dateTime={nextEvent.deadline_time}>{deadline}</time>
          </div>
        )}
        <Button asChild variant="outline" className="header-fpl">
          <a
            href="https://fantasy.premierleague.com/"
            target="_blank"
            rel="noreferrer"
          >
            Open FPL
            <ArrowUpRightIcon data-icon="inline-end" aria-hidden="true" />
          </a>
        </Button>
      </div>
    </header>
  );
}
