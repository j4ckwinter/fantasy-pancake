import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

const tones = {
  success: "success",
  warning: "warning",
  neutral: "secondary",
} as const;

export function StatusBadge({
  tone,
  children,
}: {
  tone: keyof typeof tones;
  children: ReactNode;
}) {
  return <Badge variant={tones[tone]}>{children}</Badge>;
}
