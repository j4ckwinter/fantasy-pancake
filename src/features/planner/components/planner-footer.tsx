import { ArrowUpRightIcon } from "lucide-react";
import type { Data } from "@/lib/schemas";
import "./planner-footer.css";
export function PlannerFooter({
  data,
  landing = false,
}: {
  data: Data | null;
  landing?: boolean;
}) {
  return (
    <footer className="planner-footer">
      <span className="planner-footer__source">
        {landing
          ? "Public FPL data"
          : data
            ? `Data fetched ${new Date(data.fetchedAt).toLocaleString("en-GB")}`
            : "Public data from Fantasy Premier League"}
      </span>
      <a
        className="planner-footer__link"
        href="https://fantasy.premierleague.com/"
        target="_blank"
        rel="noreferrer"
      >
        Open FPL
        <ArrowUpRightIcon className="size-4" aria-hidden="true" />
      </a>
      <span>Settings stay in this browser.</span>
    </footer>
  );
}
