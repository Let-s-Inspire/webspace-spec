import assert from "node:assert/strict";
import test from "node:test";
import { declarationDocumentErrors, requiredProposalAnchors } from "./check-local-session-declaration.mjs";
import { AUTHORITY_MATRIX, LOCAL, PROFILE_DEFAULT, assertCompleteAuthorityMatrix, localSessionSemanticErrors, resolveSessionPolicy } from "./local-session-policy.mjs";

test("absent declaration preserves profile-default compatibility", () => assert.equal(resolveSessionPolicy({}), PROFILE_DEFAULT));
test("world local policy cannot be broadened by host", () => {
  assert.equal(resolveSessionPolicy({ world: LOCAL }), LOCAL);
  assert.throws(() => resolveSessionPolicy({ world: LOCAL, host: "networked" }), /unknown host/);
});
for (const value of [LOCAL, "networked"]) test(`runtime package policy negotiation ${value} is unavailable`, () => {
  assert.throws(() => resolveSessionPolicy({ world: LOCAL, packageRequest: value }), /unsupported session policy input/);
});
test("host and Browser may narrow an undeclared world", () => {
  assert.equal(resolveSessionPolicy({ host: LOCAL }), LOCAL);
  assert.equal(resolveSessionPolicy({ browser: LOCAL }), LOCAL);
});
test("unknown policy inputs fail closed", () => assert.throws(() => resolveSessionPolicy({ browser: "future" }), /unknown browser/));
for (const [mode, accepted] of Object.entries(AUTHORITY_MATRIX)) test(`authority matrix: ${mode} is ${accepted ? "accepted" : "rejected"}`, () => {
  const manifest = mode === "absent" ? { session: { mode: LOCAL } } : { session: { mode: LOCAL }, authority: { mode } };
  assert.equal(localSessionSemanticErrors(manifest).length === 0, accepted);
});
for (const mode of ["peer", "dedicated", "provider"]) test(`semantic mutation cannot bypass authority mode ${mode}`, () => {
  const bypass = (manifest) => manifest.authority?.mode === mode ? [] : localSessionSemanticErrors(manifest);
  assert.throws(() => assertCompleteAuthorityMatrix(bypass), new RegExp(`authority mode ${mode} matrix mismatch`));
});
for (const anchor of requiredProposalAnchors) test(`semantic mutation rejects deletion of ${anchor}`, () => {
  const mutated = requiredProposalAnchors.join("\n").replace(anchor, "");
  assert.ok(declarationDocumentErrors(mutated).length > 0);
});
