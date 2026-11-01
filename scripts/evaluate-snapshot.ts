import { readFile } from "node:fs/promises";
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

const [snapshotPath, outcomesPath] = process.argv.slice(2);
if (!snapshotPath || !outcomesPath) {
  console.error(
    "Usage: node scripts/evaluate-snapshot.ts snapshot.json outcomes.json",
  );
  process.exitCode = 1;
} else {
  try {
    const { evaluateSnapshot } = (await import(
      new URL("../src/lib/evaluation.ts", import.meta.url).href
    )) as typeof import("../src/lib/evaluation");
    const [snapshot, outcomes] = await Promise.all(
      [snapshotPath, outcomesPath].map(
        async (path) => JSON.parse(await readFile(path, "utf8")) as unknown,
      ),
    );
    console.log(JSON.stringify(evaluateSnapshot(snapshot, outcomes), null, 2));
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Could not evaluate snapshot.",
    );
    process.exitCode = 1;
  }
}
