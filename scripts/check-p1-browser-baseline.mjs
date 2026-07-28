import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

// This is intentionally a local/supervisor cross-repository gate. The public
// Spec repository must not receive credentials capable of cloning the private
// Browser repository from pull-request-controlled workflow code. Callers must
// provide an independently authorized checkout at the exact pinned commit.
const specRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseline = JSON.parse(
  await readFile(path.join(specRoot, "p1-browser-baseline.json"), "utf8"),
);
const browserRoot = process.env.WEBSPACE_BROWSER_ROOT;

if (!browserRoot) {
  throw new Error("WEBSPACE_BROWSER_ROOT must name the pinned Browser checkout");
}
if (
  baseline.repository !== "Let-s-Inspire/webspace-browser" ||
  baseline.profile !== "experimental-v0" ||
  !/^[0-9a-f]{40}$/.test(baseline.canonicalCommit) ||
  !/^[0-9a-f]{40}$/.test(baseline.reviewedImplementation)
) {
  throw new Error("p1-browser-baseline.json is malformed");
}

function git(args, options = {}) {
  return execFileSync("git", ["-C", browserRoot, ...args], {
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  }).trim();
}

try {
  assertGitCheckout();
} catch (error) {
  throw new Error(`WEBSPACE_BROWSER_ROOT is not a Git checkout: ${error.message}`);
}

function assertGitCheckout() {
  const inside = git(["rev-parse", "--is-inside-work-tree"]);
  if (inside !== "true") throw new Error("not inside a work tree");
}

const head = git(["rev-parse", "HEAD"]);
if (head !== baseline.canonicalCommit) {
  throw new Error(
    `Browser HEAD ${head} does not equal pinned canonical commit ${baseline.canonicalCommit}`,
  );
}
try {
  execFileSync(
    "git",
    [
      "-C",
      browserRoot,
      "merge-base",
      "--is-ancestor",
      baseline.reviewedImplementation,
      baseline.canonicalCommit,
    ],
    { stdio: "ignore" },
  );
} catch {
  throw new Error(
    `reviewed implementation ${baseline.reviewedImplementation} is not an ancestor of ${baseline.canonicalCommit}`,
  );
}
const dirty = git(["status", "--porcelain=v1", "--untracked-files=all"]);
if (dirty) {
  throw new Error(`pinned Browser checkout is not clean:\n${dirty}`);
}

console.log(
  `P1 Browser baseline passed: ${baseline.repository} ` +
  `${baseline.canonicalCommit} contains ${baseline.reviewedImplementation} ` +
  `for ${baseline.profile}`,
);
