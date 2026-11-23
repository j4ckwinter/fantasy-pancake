import { useRef, useState } from "react";
import { loadingPlannerData } from "./messages";

export function useOperation() {
  const revision = useRef(0);
  const pending = useRef<number | null>(null);
  const [busy, setBusy] = useState(loadingPlannerData);
  const [customBusy, setCustomBusy] = useState(false);
  return {
    busy,
    customBusy,
    setBusy,
    setCustomBusy,
    blocked: () => !!busy || customBusy || pending.current !== null,
    begin() {
      const id = ++revision.current;
      pending.current = id;
      return id;
    },
    isCurrent: (id: number) => id === revision.current,
    finish(id: number, settle: () => void) {
      if (pending.current !== id) return;
      pending.current = null;
      settle();
    },
    invalidate() {
      revision.current++;
    },
  };
}
