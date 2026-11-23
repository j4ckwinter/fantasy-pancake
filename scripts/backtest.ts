import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (
        (specifier.startsWith("./") || specifier.startsWith("../")) &&
        !/\.[a-z]+$/i.test(specifier)
      ) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw error;
    }
  },
});

const [directory] = process.argv.slice(2);
if (!directory) {
  console.error("Usage: node scripts/backtest.ts .cache/backtest/<date>");
  process.exit(1);
}

const readJson = async (path: string) =>
  JSON.parse(await readFile(path, "utf8")) as unknown;

const { seasonArchiveSchema, runBacktest } = (await import(
  new URL("../src/lib/evaluation.ts", import.meta.url).href
)) as typeof import("../src/lib/evaluation");

const summaries = join(directory, "element-summary");
const histories: Record<string, unknown> = {};
for (const file of await readdir(summaries)) {
  const summary = (await readJson(join(summaries, file))) as {
    history: unknown;
  };
  histories[file.replace(/\.json$/, "")] = summary.history;
}
const archive = seasonArchiveSchema.parse({
  bootstrap: await readJson(join(directory, "bootstrap-static.json")),
  fixtures: await readJson(join(directory, "fixtures.json")),
  histories,
});
console.log(JSON.stringify(runBacktest(archive), null, 2));
