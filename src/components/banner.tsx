import type { ReactNode } from "react";
import { CircleAlertIcon, TriangleAlertIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const tones = {
  error: { variant: "destructive", role: "alert", Icon: CircleAlertIcon },
  warning: { variant: "warning", role: "status", Icon: TriangleAlertIcon },
} as const;

export function Banner({
  title,
  tone,
  children,
}: {
  title: ReactNode;
  tone: keyof typeof tones;
  children: ReactNode;
}) {
  const { variant, role, Icon } = tones[tone];
  return (
    <Alert variant={variant} role={role}>
      <Icon aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
