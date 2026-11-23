import { afterEach, describe, expect, it, vi } from "vitest";
import { FplError } from "../../lib/fpl";
import { errorResponse } from "./error-response";

afterEach(() => vi.restoreAllMocks());

describe("API error responses", () => {
  it("passes an FPL error's message and status to the client", async () => {
    const response = errorResponse(
      new FplError("No FPL history was found for that player.", 404),
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "No FPL history was found for that player.",
    });
  });

  it("hides unexpected failures behind a generic 502 and logs them", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = errorResponse(new Error("schema mismatch"));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Could not load valid FPL data. Please try again shortly.",
    });
    expect(log).toHaveBeenCalledWith("FPL request failed", "schema mismatch");
  });
});
