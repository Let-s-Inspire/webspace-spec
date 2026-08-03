import assert from "node:assert/strict";
import test from "node:test";
import { declarationDocumentErrors, requiredProposalAnchors } from "./check-local-session-declaration.mjs";
import { LOCAL, PROFILE_DEFAULT, localSessionSemanticErrors, resolveSessionPolicy } from "./local-session-policy.mjs";

test("absent declaration preserves profile-default compatibility", () => assert.equal(resolveSessionPolicy({}), PROFILE_DEFAULT));
test("world local policy cannot be broadened by host or package", () => {
  assert.equal(resolveSessionPolicy({ world: LOCAL }), LOCAL);
  assert.throws(() => resolveSessionPolicy({ world: LOCAL, host: "networked" }), /unknown host/);
  assert.throws(() => resolveSessionPolicy({ world: LOCAL, packageRequest: "networked" }), /cannot broaden/);
});
test("host and Browser may narrow an undeclared world", () => {
  assert.equal(resolveSessionPolicy({ host: LOCAL }), LOCAL);
  assert.equal(resolveSessionPolicy({ browser: LOCAL }), LOCAL);
});
test("unknown policy inputs fail closed", () => assert.throws(() => resolveSessionPolicy({ browser: "future" }), /unknown browser/));
test("local authority conflict is rejected and none is accepted", () => {
  assert.deepEqual(localSessionSemanticErrors({ session: { mode: LOCAL }, authority: { mode: "peer" } }), ["session.mode local conflicts with network-session authority"]);
  assert.deepEqual(localSessionSemanticErrors({ session: { mode: LOCAL }, authority: { mode: "none" } }), []);
});
for (const anchor of requiredProposalAnchors) test(`semantic mutation rejects deletion of ${anchor}`, () => {
  const mutated = requiredProposalAnchors.join("\n").replace(anchor, "");
  assert.ok(declarationDocumentErrors(mutated).length > 0);
});
