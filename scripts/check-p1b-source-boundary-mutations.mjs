import process from "node:process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditP1BBoundaryMutations } from "./lib/p1b-source-boundary-mutations.mjs";

const browserRoot = process.env.WEBSPACE_BROWSER_ROOT;
if (!browserRoot) throw new Error("WEBSPACE_BROWSER_ROOT must name a Browser checkout");
const specRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseline = JSON.parse(await readFile(path.join(specRoot, "p1-browser-baseline.json"), "utf8"));

const report = await auditP1BBoundaryMutations({
  browserRoot,
  expectedCommit: baseline.canonicalCommit,
});
console.log(`PASS survived control: ${report.control}`);
for (const mutation of report.killed) {
  console.log(`PASS killed: ${mutation.name} [${mutation.file}] -> ${mutation.failingTest}`);
}
console.log(`P1B source-boundary mutations: ${report.killed.length}/${report.killed.length} killed`);
