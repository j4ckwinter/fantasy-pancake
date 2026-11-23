import { useRef, useState } from "react";
import type { Data } from "@/lib/schemas";
import { loadPlayerHistories } from "./api";

export function usePlayerDetails(data: Data | null) {
  const request = useRef(0);
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [playerData, setPlayerData] = useState<Data | null>(null);
  async function openPlayer(id: number) {
    const current = ++request.current;
    setPlayerId(id);
    setPlayerData(data);
    if (!data || data.histories?.[String(id)]) return;
    const enriched = await loadPlayerHistories(data, [id]);
    if (current === request.current) setPlayerData(enriched.data);
  }
  function closePlayer() {
    request.current++;
    setPlayerId(null);
  }
  return { playerId, playerData: playerData ?? data, openPlayer, closePlayer };
}
