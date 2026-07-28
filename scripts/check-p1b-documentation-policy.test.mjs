import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { assertP1BDocumentationPolicy } from "./lib/p1b-documentation-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const canonical = await readFile(
  path.join(root, "proposals/0005-package-sources-and-origin-bridge.md"),
  "utf8",
);

test("proposal 0005 records explicit relay selection", () => {
  assert.doesNotThrow(() => assertP1BDocumentationPolicy(canonical));
});

test("automatic bridge-to-relay flow is rejected", () => {
  const mutated = canonical.replace(
    "transport-unavailable ────────────────> VISIBLE TYPED FAILURE",
    "transport-unavailable ────────────────> RELAY, public only",
  );
  assert.notEqual(mutated, canonical);
  assert.throws(() => assertP1BDocumentationPolicy(mutated), /bridge transport failure|automatic bridge-to-relay/);
});

test("legacy webspacerelay.html discovery is rejected", () => {
  const mutated = canonical.replace(
    "sibling `https://world.example/worlds/webspacebridge.html`",
    "sibling `https://world.example/worlds/webspacerelay.html`",
  );
  assert.notEqual(mutated, canonical);
  assert.throws(() => assertP1BDocumentationPolicy(mutated), /webspacerelay\.html/);
});

