import { useState } from "react";
import { Button, TextField } from "@jack.winter/pancake-ui";
import type { Player } from "@/lib/schemas";
import { fromMillions, toMillions } from "../format";

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
  const [draft, setDraft] = useState(String(toMillions(value)));
  return (
    <form
      className="selling-price-check"
      onSubmit={(event) => {
        event.preventDefault();
        onConfirm(fromMillions(Number(draft)));
      }}
    >
      <TextField
        label={`Selling price for ${player.web_name} (£m)`}
        type="number"
        min="0"
        max={toMillions(player.now_cost)}
        step="0.1"
        required
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <Button type="submit" variant="secondary">
        {confirmed && fromMillions(Number(draft)) === value
          ? "Recheck price"
          : "Confirm price"}
      </Button>
    </form>
  );
}
