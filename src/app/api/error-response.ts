import { errorMessage } from "../../lib/error-message";
import { FplError } from "../../lib/fpl";

export function errorResponse(error: unknown) {
  if (error instanceof FplError)
    return Response.json({ error: error.message }, { status: error.status });
  console.error("FPL request failed", errorMessage(error, "Unknown error"));
  return Response.json(
    { error: "Could not load valid FPL data. Please try again shortly." },
    { status: 502 },
  );
}
