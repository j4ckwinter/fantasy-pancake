import { useCallback, useRef, useState } from "react";
import type { Data } from "@/lib/schemas";
import { loadPlannerData } from "./api";
import { plannerDataExpired } from "./freshness";

function withoutHistories(data: Data): Data {
  return { ...data, histories: {} };
}

export function usePlannerData() {
  const loadedAt = useRef<number | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const loaded = useCallback((next: Data, at: number | null = Date.now()) => {
    loadedAt.current = at;
    setData(next);
  }, []);
  return {
    data,
    loaded,
    enriched: setData,
    expired: () => plannerDataExpired(loadedAt.current),
    async current() {
      if (data && !plannerDataExpired(loadedAt.current))
        return { data, loadedAt: loadedAt.current };
      const fresh = await loadPlannerData();
      return { data: withoutHistories(fresh), loadedAt: Date.now() };
    },
  };
}
