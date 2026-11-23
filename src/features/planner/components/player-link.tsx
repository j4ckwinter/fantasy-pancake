import type { ReactNode } from "react";

export function PlayerLink({
  playerId,
  onSelect,
  className,
  label,
  children,
}: {
  playerId: number;
  onSelect: (id: number) => void;
  className?: string;
  label?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      onClick={(event) => {
        // Safari does not focus buttons on pointer activation.
        event.currentTarget.focus({ preventScroll: true });
        onSelect(playerId);
      }}
    >
      {children}
    </button>
  );
}
