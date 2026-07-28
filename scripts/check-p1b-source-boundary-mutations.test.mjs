import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { auditP1BBoundaryMutations } from "./lib/p1b-source-boundary-mutations.mjs";

const execFileAsync = promisify(execFile);
const specRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseline = JSON.parse(await readFile(path.join(specRoot, "p1-browser-baseline.json"), "utf8"));

test("canonical Browser kills every P1B source-boundary mutation", async () => {
  const browserRoot = process.env.WEBSPACE_BROWSER_ROOT;
  assert.ok(browserRoot, "WEBSPACE_BROWSER_ROOT is required");
  const report = await auditP1BBoundaryMutations({
    browserRoot,
    expectedCommit: baseline.canonicalCommit,
  });
  assert.equal(report.control, "harmless comment");
  assert.deepEqual(report.killed.map(({ name }) => name), [
    "wildcard bridge target origin",
    "legacy webspacerelay.html discovery",
    "automatic relay selection",
    "relay credential forwarding",
    "loose relay package-root integrity removal",
    "bundled relay package-root integrity removal",
    "private anonymous relay downgrade",
    "fallback on integrity/schema/authentication failure",
    "source failure teardown removal",
    "runtime failure teardown removal",
    "bridge iframe teardown removal",
  ]);
});

async function disposableCheckout() {
  const root = await mkdtemp(path.join(os.tmpdir(), "p1b-baseline-rejection-"));
  await execFileAsync("git", ["init", "-q", root]);
  await execFileAsync("git", ["-C", root, "config", "user.name", "P1B Test"]);
  await execFileAsync("git", ["-C", root, "config", "user.email", "p1b@example.invalid"]);
  await writeFile(path.join(root, "fixture.txt"), "baseline\n");
  await execFileAsync("git", ["-C", root, "add", "fixture.txt"]);
  await execFileAsync("git", ["-C", root, "commit", "-q", "-m", "baseline"]);
  const { stdout } = await execFileAsync("git", ["-C", root, "rev-parse", "HEAD"]);
  return { root, head: stdout.trim() };
}

test("wrong Browser HEAD is rejected before mutation staging", async () => {
  const checkout = await disposableCheckout();
  let staged = false;
  try {
    await assert.rejects(
      auditP1BBoundaryMutations({
        browserRoot: checkout.root,
        expectedCommit: "0000000000000000000000000000000000000000",
        onStage: () => { staged = true; },
      }),
      /Browser HEAD must equal audited canonical commit/,
    );
    assert.equal(staged, false);
  } finally {
    await rm(checkout.root, { recursive: true, force: true });
  }
});

test("dirty Browser checkout is rejected before mutation staging", async () => {
  const checkout = await disposableCheckout();
  let staged = false;
  try {
    await writeFile(path.join(checkout.root, "fixture.txt"), "dirty\n");
    await assert.rejects(
      auditP1BBoundaryMutations({
        browserRoot: checkout.root,
        expectedCommit: checkout.head,
        onStage: () => { staged = true; },
      }),
      /audited Browser checkout must be clean/,
    );
    assert.equal(staged, false);
  } finally {
    await rm(checkout.root, { recursive: true, force: true });
  }
});

test("nested directory is rejected before mutation staging", async () => {
  const checkout = await disposableCheckout();
  let staged = false;
  try {
    const nested = path.join(checkout.root, "partial", "browser");
    await mkdir(nested, { recursive: true });
    await assert.rejects(
      auditP1BBoundaryMutations({
        browserRoot: nested,
        expectedCommit: checkout.head,
        onStage: () => { staged = true; },
      }),
      /WEBSPACE_BROWSER_ROOT itself must be the audited Git worktree root/,
    );
    assert.equal(staged, false);
  } finally {
    await rm(checkout.root, { recursive: true, force: true });
  }
});
