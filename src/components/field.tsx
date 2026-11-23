import { useId, type ComponentProps, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/components/utils";

type FieldProps = { label: ReactNode; helperText?: string };

function describedBy(...ids: (string | undefined | false)[]) {
  return ids.filter(Boolean).join(" ") || undefined;
}

function FieldLabel({
  htmlFor,
  label,
  required,
}: {
  htmlFor: string;
  label: ReactNode;
  required?: boolean;
}) {
  return (
    <Label htmlFor={htmlFor}>
      {label}
      {required && (
        <span aria-hidden="true" className="text-muted-foreground">
          *
        </span>
      )}
    </Label>
  );
}

export function TextField({
  label,
  helperText,
  id,
  className,
  required,
  "aria-describedby": extraDescription,
  ...props
}: ComponentProps<typeof Input> & FieldProps) {
  const generated = useId();
  const inputId = id ?? generated;
  const helpId = `${inputId}-help`;
  return (
    <div data-slot="field" className={cn("grid gap-1.5", className)}>
      <FieldLabel htmlFor={inputId} label={label} required={required} />
      <Input
        id={inputId}
        required={required}
        aria-describedby={describedBy(helperText && helpId, extraDescription)}
        {...props}
      />
      {helperText && (
        <p id={helpId} className="text-xs text-muted-foreground">
          {helperText}
        </p>
      )}
    </div>
  );
}

export function SelectField({
  label,
  helperText,
  id,
  className,
  required,
  "aria-describedby": extraDescription,
  ...props
}: ComponentProps<typeof NativeSelect> & FieldProps) {
  const generated = useId();
  const selectId = id ?? generated;
  const helpId = `${selectId}-help`;
  return (
    <div data-slot="field" className={cn("grid gap-1.5", className)}>
      <FieldLabel htmlFor={selectId} label={label} required={required} />
      <NativeSelect
        id={selectId}
        required={required}
        aria-describedby={describedBy(helperText && helpId, extraDescription)}
        {...props}
      />
      {helperText && (
        <p id={helpId} className="text-xs text-muted-foreground">
          {helperText}
        </p>
      )}
    </div>
  );
}
