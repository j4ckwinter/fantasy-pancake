"use client";

import type { ReactNode } from "react";
import { ChevronRightIcon } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export function Disclosure({
  summary,
  defaultOpen,
  children,
}: {
  summary: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      data-slot="disclosure"
      className="group/disclosure border-t border-border first:border-t-0"
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 rounded-md py-3 text-left text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        {summary}
        <ChevronRightIcon
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-data-[state=open]/disclosure:rotate-90 motion-reduce:transition-none"
        />
      </CollapsibleTrigger>
      <CollapsibleContent
        forceMount
        className="pb-3 text-sm data-[state=closed]:hidden"
      >
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
