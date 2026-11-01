import { useState } from "react";
import { Button, TextField } from "@jack.winter/pancake-ui";
import type { Player } from "@/lib/schemas";

export function SellingPriceCheck({
  player,
  value,
  confirmed,
  onConfirm,
}: {
  player: Player;
  value: number;
  confirmed: boolean;
  onConfirm: (price: number) => void;
}) {
  const [draft, setDraft] = useState(String(value / 10));
  return (
    <form
      className="selling-price-check"
      onSubmit={(event) => {
        event.preventDefault();
        onConfirm(Math.round(Number(draft) * 10));
      }}
    >
      <TextField
        label={`Selling price for ${player.web_name} (£m)`}
        type="number"
        min="0"
        max={player.now_cost / 10}
        step="0.1"
        required
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <Button type="submit" variant="secondary">
        {confirmed && Math.round(Number(draft) * 10) === value
          ? "Recheck price"
          : "Confirm price"}
      </Button>
    </form>
  );
}
