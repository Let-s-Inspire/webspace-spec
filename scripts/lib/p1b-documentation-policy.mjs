import assert from "node:assert/strict";

function splitMarkdownTableRow(row) {
  const cells = [];
  let cell = "";
  let codeFenceLength = 0;
  for (let index = 0; index < row.length;) {
    if (row[index] === "\\") {
      cell += row[index];
      if (index + 1 < row.length) cell += row[index + 1];
      index += 2;
      continue;
    }
    if (row[index] === "`") {
      let end = index + 1;
      while (row[end] === "`") end++;
      const run = row.slice(index, end);
      if (codeFenceLength === 0) codeFenceLength = run.length;
      else if (codeFenceLength === run.length) codeFenceLength = 0;
      cell += run;
      index = end;
      continue;
    }
    if (row[index] === "|" && codeFenceLength === 0) {
      cells.push(cell.trim());
      cell = "";
      index++;
      continue;
    }
    cell += row[index++];
  }
  cells.push(cell.trim());
  return cells.filter((value, index) =>
    value || (index > 0 && index < cells.length - 1));
}

function normalizeMarkdownProse(source) {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const tableRows = new Set();
  for (let index = 0; index < lines.length; index++) {
    if (!/^\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index])) continue;
    if (index > 0 && lines[index - 1].includes("|")) tableRows.add(index - 1);
    tableRows.add(index);
    for (let row = index + 1; row < lines.length && lines[row].trim() && lines[row].includes("|"); row++) {
      tableRows.add(row);
    }
  }
  const output = [];
  let context = null;
  let inFence = false;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (/^\s*(?:```|~~~)/.test(line)) {
      output.push(line);
      inFence = !inFence;
      context = null;
      continue;
    }
    if (inFence) {
      output.push(line);
      continue;
    }
    if (!line.trim()) {
      output.push("");
      context = null;
      continue;
    }
    if (tableRows.has(index)) {
      output.push(...splitMarkdownTableRow(line));
      context = null;
      continue;
    }
    if (/^\s*(?:#{1,6}\s|\|)/.test(line)) {
      output.push(line);
      context = null;
      continue;
    }
    const listItem = /^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (listItem) {
      output.push(listItem[2]);
      context = { type: "list", indent: listItem[1].length };
      continue;
    }
    if (context?.type === "list" && /^\s+/.test(line)) {
      output[output.length - 1] += ` ${line.trim()}`;
      continue;
    }
    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      if (context?.type === "quote") {
        output[output.length - 1] += ` ${quote[1].trim()}`;
      } else {
        output.push(quote[1]);
      }
      context = { type: "quote" };
      continue;
    }
    if (context?.type === "prose") {
      output[output.length - 1] += ` ${line.trim()}`;
    } else {
      output.push(line);
    }
    context = { type: "prose" };
  }
  return output.join("\n");
}

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
  const warningOnlyRelaySentence = normalizeMarkdownProse(source)
    .split(/(?<=[.!?])\s+|\n+/)
    .find((sentence) => {
      const actions = Array.from(
        sentence.matchAll(/\b(?:proceed|continue|load|loaded|run|use|used|accept(?:ed)?|allow(?:ed)?|permit(?:ted)?)\b/gi),
      );
      let previousAction;
      let previousNegated = false;
      const hasUnnegatedAction = actions.some((action) => {
        const actionPrefix = sentence.slice(0, action.index);
        const directlyNegated =
          /\b(?:must|may|shall|should|can|is|are|was|were)\s+(?:not|never)\s+(?:be\s+)?$/i.test(actionPrefix) ||
          /\b(?:must|may|shall|should|can|is|are|was|were)\s+neither\s+(?:be\s+)?$/i.test(actionPrefix) ||
          /\b(?:cannot|can't)\s+(?:be\s+)?$/i.test(actionPrefix) ||
          /\bnever\s+(?:be\s+)?$/i.test(actionPrefix);
        const separator = previousAction
          ? sentence.slice(previousAction.index + previousAction[0].length, action.index)
          : "";
        const inheritsCoordinatedNegation = previousAction &&
          previousNegated &&
          /^\s*(?:,\s*)?(?:(?:and|or|nor)\s*)?$/i.test(separator);
        const negated = directlyNegated || inheritsCoordinatedNegation;
        previousAction = action;
        previousNegated = negated;
        return !negated;
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
