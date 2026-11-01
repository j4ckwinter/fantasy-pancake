import type { Data } from "@/lib/schemas";
export function PlannerFooter({
  data,
  landing = false,
}: {
  data: Data | null;
  landing?: boolean;
}) {
  return (
    <footer>
      <span>
        {landing
          ? "Public FPL data"
          : data
            ? `Data fetched ${new Date(data.fetchedAt).toLocaleString("en-GB")}`
            : "Public data from Fantasy Premier League"}
      </span>
      <a
        href="https://fantasy.premierleague.com/"
        target="_blank"
        rel="noreferrer"
      >
        Open FPL ↗
      </a>
      <span>Settings stay in this browser.</span>
    </footer>
  );
}
