import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = "https://fantasy.premierleague.com/api/";
const MIN_REQUEST_GAP_MS = 300;
const MAX_ATTEMPTS = 4;
const RETRY_BACKOFF_MS = 5_000;
const REQUEST_TIMEOUT_MS = 20_000;

const cacheDate = process.argv[2] ?? new Date().toISOString().slice(0, 10);
const directory = join(".cache", "backtest", cacheDate);

const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));
let lastRequestAt = 0;

async function fetchJson(path: string): Promise<unknown> {
  for (let attempt = 1; ; attempt++) {
    const wait = lastRequestAt + MIN_REQUEST_GAP_MS - Date.now();
    if (wait > 0) await pause(wait);
    lastRequestAt = Date.now();
    try {
      const response = await fetch(ROOT + path, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.ok) return await response.json();
      if (response.status === 404 || attempt >= MAX_ATTEMPTS)
        throw new Error(`${path} returned ${response.status}`);
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS) throw error;
    }
    await pause(RETRY_BACKOFF_MS * attempt);
  }
}

async function cached(name: string, path: string): Promise<unknown> {
  const file = join(directory, name);
  if (existsSync(file)) return JSON.parse(await readFile(file, "utf8"));
  const value = await fetchJson(path);
  await writeFile(`${file}.partial`, JSON.stringify(value));
  await rename(`${file}.partial`, file);
  return value;
}

await mkdir(join(directory, "element-summary"), { recursive: true });
const bootstrap = (await cached(
  "bootstrap-static.json",
  "bootstrap-static/",
)) as {
  elements: { id: number }[];
};
await cached("fixtures.json", "fixtures/");
const ids = bootstrap.elements.map((element) => element.id);
let fetched = 0;
for (const id of ids) {
  const file = join("element-summary", `${id}.json`);
  if (!existsSync(join(directory, file))) fetched++;
  await cached(file, `element-summary/${id}/`);
}
console.log(
  `Cached ${ids.length} players in ${directory} (${fetched} fetched now).`,
);
