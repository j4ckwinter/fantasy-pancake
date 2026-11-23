import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPlannerData, loadTeamPicks } from "./api";

function respond(body: string, status: number) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(body, { status })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("planner API requests", () => {
  it("explains a failed request whose error page is not JSON", async () => {
    respond("<!DOCTYPE html><title>Gateway Timeout</title>", 504);
    await expect(loadPlannerData()).rejects.toThrow(
      "The request failed. Please try again.",
    );
  });

  it("shows the server's message for a failed request", async () => {
    respond(JSON.stringify({ error: "FPL is down." }), 502);
    await expect(loadPlannerData()).rejects.toThrow("FPL is down.");
  });

  it("explains a successful response that is not JSON", async () => {
    respond("<html></html>", 200);
    await expect(loadPlannerData()).rejects.toThrow(
      "The server sent an unexpected response. Please try again.",
    );
  });

  it("explains a successful response that breaks the data contract", async () => {
    respond(JSON.stringify({ picks: "none" }), 200);
    await expect(loadTeamPicks("1")).rejects.toThrow(
      "The server sent an unexpected response. Please try again.",
    );
  });
});
