import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { assertP1Agreement, loadP1Contract } from "./lib/p1-cross-repo-contract.mjs";

const specRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const browserRoot = process.env.WEBSPACE_BROWSER_ROOT;
if (!browserRoot) {
  throw new Error("WEBSPACE_BROWSER_ROOT must name a canonical Browser checkout");
}

const contract = await loadP1Contract({ specRoot, browserRoot });
const results = contract.fixtures.map((fixture) => contract.evaluate(fixture));
assertP1Agreement(results);
for (const result of results) {
  console.log(`PASS ${result.fixture}: Spec=${result.spec} Browser=${result.browser}`);
}
console.log(`P1 cross-repository contract: ${results.length}/${results.length} fixtures agree`);
