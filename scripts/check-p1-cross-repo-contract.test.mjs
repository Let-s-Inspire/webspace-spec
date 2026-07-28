import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { assertP1Agreement, loadP1Contract } from "./lib/p1-cross-repo-contract.mjs";

const specRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const browserRoot = process.env.WEBSPACE_BROWSER_ROOT;

test("canonical Spec schemas and Browser validators agree bidirectionally", async () => {
  assert.ok(browserRoot, "WEBSPACE_BROWSER_ROOT is required");
  const contract = await loadP1Contract({ specRoot, browserRoot });
  const results = contract.fixtures.map((fixture) => contract.evaluate(fixture));
  assert.doesNotThrow(() => assertP1Agreement(results));
});

for (const mutation of [
  { name: "unknown-field acceptance", fixture: "world unknown field", side: "browser", accept: true },
  { name: "world/object schema drift", fixture: "world schema identifies object", side: "spec", accept: true },
  { name: "traversal acceptance", fixture: "world traversal path", side: "browser", accept: true },
  { name: "unsupported-version acceptance", fixture: "future profile version", side: "spec", accept: true },
]) {
  test(`agreement gate fails under ${mutation.name}`, async () => {
    const contract = await loadP1Contract({ specRoot, browserRoot });
    const results = contract.fixtures.map((fixture) => contract.evaluate(fixture, mutation));
    assert.throws(() => assertP1Agreement(results), new RegExp(mutation.fixture.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
}
