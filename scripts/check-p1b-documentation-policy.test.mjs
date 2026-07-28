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

test("warning-only unpinned relay acquisition is rejected", () => {
  const mutated = canonical.replace(
    /Independently supplied manifest-root or whole-bundle integrity detects changed\nbytes\. A missing or mismatched package-root pin fails relay acquisition before\nentry acquisition, capability negotiation, or runtime creation\. Disclosure of\nthe intermediary is required for privacy transparency but never substitutes\nfor integrity\./,
    "Pinned bundle integrity or publisher signatures detect changed bytes.\nUnpinned relayed packages receive a visible warning.",
  );
  assert.notEqual(mutated, canonical);
  assert.throws(
    () => assertP1BDocumentationPolicy(mutated),
    /missing or mismatched relay integrity|warning-only unpinned relay/,
  );
});

test("semantically equivalent unpinned relay proceed warning is rejected", () => {
  const mutated = `${canonical}\nUnpinned relay packages may proceed after a visible warning.\n`;
  assert.throws(
    () => assertP1BDocumentationPolicy(mutated),
    /relay packages without integrity pins cannot proceed under warning-only policy/,
  );
});

test("warning-first unpinned relay proceed language is rejected", () => {
  const mutated = `${canonical}\nAfter a visible warning, unpinned relay packages may proceed.\n`;
  assert.throws(
    () => assertP1BDocumentationPolicy(mutated),
    /relay packages without integrity pins cannot proceed under warning-only policy/,
  );
});

test("missing-integrity-pin relay proceed language is rejected", () => {
  const mutated = `${canonical}\nRelay packages without integrity pins may proceed after a visible warning.\n`;
  assert.throws(
    () => assertP1BDocumentationPolicy(mutated),
    /relay packages without integrity pins cannot proceed under warning-only policy/,
  );
});

test("missing-integrity-pin relay use permission is rejected", () => {
  const mutated = `${canonical}\nRelay packages missing their integrity pins may be used after a visible warning.\n`;
  assert.throws(
    () => assertP1BDocumentationPolicy(mutated),
    /relay packages without integrity pins cannot proceed under warning-only policy/,
  );
});

test("negated missing-integrity-pin relay use remains allowed", () => {
  const clarified = `${canonical}\nRelay packages missing their integrity pins must not be used after a visible warning.\n`;
  assert.doesNotThrow(() => assertP1BDocumentationPolicy(clarified));
});

test("later unnegated relay use overrides earlier ordinary-use negation", () => {
  const mutated = `${canonical}\nRelay packages missing their integrity pins must not be used ordinarily, but may be used after a visible warning.\n`;
  assert.throws(
    () => assertP1BDocumentationPolicy(mutated),
    /relay packages without integrity pins cannot proceed under warning-only policy/,
  );
});

test("later relay permission overrides default-use negation", () => {
  const mutated = `${canonical}\nRelay packages missing their integrity pins cannot be used by default but are permitted after a visible warning.\n`;
  assert.throws(
    () => assertP1BDocumentationPolicy(mutated),
    /relay packages without integrity pins cannot proceed under warning-only policy/,
  );
});

test("negation propagates across accepted-or-used coordination", () => {
  const clarified = `${canonical}\nRelay packages missing their integrity pins must not be accepted or used after a visible warning.\n`;
  assert.doesNotThrow(() => assertP1BDocumentationPolicy(clarified));
});

test("negation propagates across comma-coordinated load run and use", () => {
  const clarified = `${canonical}\nRelay packages missing their integrity pins cannot be loaded, run, or used after a visible warning.\n`;
  assert.doesNotThrow(() => assertP1BDocumentationPolicy(clarified));
});

test("not-nor coordination remains negated", () => {
  const clarified = `${canonical}\nRelay packages missing their integrity pins must not be accepted nor used after a visible warning.\n`;
  assert.doesNotThrow(() => assertP1BDocumentationPolicy(clarified));
});

test("neither-nor coordination remains negated", () => {
  const clarified = `${canonical}\nRelay packages missing their integrity pins can neither be loaded nor used after a visible warning.\n`;
  assert.doesNotThrow(() => assertP1BDocumentationPolicy(clarified));
});
