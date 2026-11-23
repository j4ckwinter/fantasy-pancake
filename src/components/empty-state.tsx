import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
}: {
  title: ReactNode;
  description: ReactNode;
}) {
  return (
    <div
      data-slot="empty-state"
      className="grid justify-items-center gap-1 rounded-xl border border-dashed border-border bg-card px-6 py-10 text-center"
    >
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="max-w-prose text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
