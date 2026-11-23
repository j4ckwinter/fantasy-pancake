import { useRef, useState } from "react";
import type { Data } from "@/lib/schemas";
import { loadPlayerHistories } from "./api";

type Histories = NonNullable<Data["histories"]>;

export function usePlayerDetails(data: Data | null) {
  const request = useRef(0);
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [loaded, setLoaded] = useState<{
    fetchedAt: string;
    histories: Histories;
  } | null>(null);
  const cached =
    data && loaded?.fetchedAt === data.fetchedAt ? loaded.histories : {};
  const playerData = data && {
    ...data,
    histories: { ...cached, ...data.histories },
  };
  async function openPlayer(id: number) {
    const current = ++request.current;
    setPlayerId(id);
    if (!playerData || playerData.histories[String(id)]) return;
    const enriched = await loadPlayerHistories(playerData, [id]);
    const history = enriched.data.histories[String(id)];
    if (current !== request.current || !history) return;
    setLoaded({
      fetchedAt: playerData.fetchedAt,
      histories: { ...cached, [String(id)]: history },
    });
  }
  function closePlayer() {
    request.current++;
    setPlayerId(null);
  }
  return { playerId, playerData, openPlayer, closePlayer };
}
