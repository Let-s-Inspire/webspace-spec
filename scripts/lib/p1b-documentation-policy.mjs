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
  assert.match(
    source,
    /A missing or mismatched package-root pin fails relay acquisition before[\s\S]*runtime creation/,
    "missing or mismatched relay integrity must fail before runtime",
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
  assert.doesNotMatch(
    source,
    /Unpinned relayed packages receive a visible warning/i,
    "warning-only unpinned relay acquisition is forbidden",
  );
  const warningOnlyRelaySentence = source
    .split(/(?<=[.!?])\s+|\n+/)
    .find((sentence) => {
      const actions = sentence.matchAll(/\b(?:proceed|continue|load|run|use|used|accept(?:ed)?|allow(?:ed)?|permit(?:ted)?)\b/gi);
      const hasUnnegatedAction = Array.from(actions).some((action) => {
        const actionPrefix = sentence.slice(0, action.index);
        return !(
          /\b(?:must|may|shall|should|can|is|are|was|were)\s+(?:not|never)\s+(?:be\s+)?$/i.test(actionPrefix) ||
          /\b(?:cannot|can't)\s+(?:be\s+)?$/i.test(actionPrefix) ||
          /\bnever\s+(?:be\s+)?$/i.test(actionPrefix)
        );
      });
      return hasUnnegatedAction &&
        /relay(?:ed)?\s+packages?/i.test(sentence) &&
        /\bwarning\b/i.test(sentence) &&
        (
          /\bunpinned\b/i.test(sentence) ||
          /\b(?:without|missing|lacking)\b[^.!?\n]{0,100}\bintegrity\b[^.!?\n]{0,60}\bpins?\b/i.test(sentence)
        );
    });
  assert.equal(
    warningOnlyRelaySentence,
    undefined,
    "relay packages without integrity pins cannot proceed under warning-only policy",
  );
}
