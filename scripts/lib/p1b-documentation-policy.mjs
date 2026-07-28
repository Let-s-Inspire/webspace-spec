import assert from "node:assert/strict";

export function assertP1BDocumentationPolicy(source) {
  assert.match(
    source,
    /BRIDGE[\s\S]*transport-unavailable [^\n]*> VISIBLE TYPED FAILURE/,
    "bridge transport failure must produce a visible typed failure",
  );
  assert.match(
    source,
    /VISITOR SELECTS "RETRY THROUGH RELAY" \(public packages only\)/,
    "public relay must require explicit visitor selection",
  );
  assert.match(
    source,
    /new source which is credentialless[\s\S]*requires independently supplied[\s\S]*integrity/,
    "explicit relay source must be credentialless and independently integrity-pinned",
  );
  assert.doesNotMatch(
    source,
    /BRIDGE[\s\S]{0,300}transport-unavailable [^\n]*> RELAY/,
    "automatic bridge-to-relay flow is forbidden",
  );
  assert.doesNotMatch(
    source,
    /webspacerelay\.html/i,
    "webspacerelay.html must not be canonical bridge discovery",
  );
}
