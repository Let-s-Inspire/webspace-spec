import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const LOADER = "client/js/ContentNavigator/WebspacePackageLoader.js";
const CONTENT_LOADER = "client/js/ContentNavigator/ContentLoader.js";
const CONTRACT = "client/js/ContentNavigator/WebspacePackageLoader.contract.test.mjs";
const BUNDLE_CONTRACT = "client/js/ContentNavigator/WebspacePackageBundle.contract.test.mjs";
const CONNECTOR_CONTRACT = "client/js/ContentNavigator/WebspacePackageLoader.carrier-connector.test.mjs";

function replaceRequired(source, from, to, label) {
  const occurrences = source.split(from).length - 1;
  assert.equal(occurrences, 1, `${label} mutation target must occur exactly once`);
  const mutated = source.replace(from, to);
  assert.notEqual(mutated, source, `${label} mutation must change the Browser copy`);
  return mutated;
}

async function runTest(root, testFile, testName) {
  const { NODE_TEST_CONTEXT: _nodeTestContext, ...cleanEnvironment } = process.env;
  try {
    const result = await execFileAsync(
      process.execPath,
      ["--test", `--test-name-pattern=${testName}`, path.join(root, testFile)],
      { cwd: root, env: cleanEnvironment, maxBuffer: 4 * 1024 * 1024 },
    );
    return { code: 0, output: `${result.stdout}${result.stderr}` };
  } catch (error) {
    return {
      code: typeof error.code === "number" ? error.code : 1,
      output: `${error.stdout || ""}${error.stderr || ""}`,
    };
  }
}

const mutations = [
  {
    name: "wildcard bridge target origin",
    file: LOADER,
    testFile: CONNECTOR_CONTRACT,
    testName: "production iframe connector loads world carrier with exact sandbox and handshake",
    from: "}, expectedOrigin, [channel.port2]);",
    to: "}, '*', [channel.port2]);",
  },
  {
    name: "legacy webspacerelay.html discovery",
    file: LOADER,
    testFile: CONTRACT,
    testName: "bridge discovery probes the exact canonical sequence and never the legacy relay helper",
    from: "new URL('webspacebridge.html', new URL('./', packageAddress))",
    to: "new URL('webspacerelay.html', new URL('./', packageAddress))",
  },
  {
    name: "automatic relay selection",
    file: CONTENT_LOADER,
    testFile: CONTRACT,
    testName: "relay privacy disclosure requires an explicit visitor action",
    from: "retry.addEventListener('click', () =>\n    {\n        dialog.remove();\n        onRetry();\n    }, { once: true });",
    to: "dialog.remove();\n    onRetry();\n    retry.addEventListener('click', () => {}, { once: true });",
  },
  {
    name: "relay credential forwarding",
    file: LOADER,
    testFile: CONTRACT,
    testName: "explicit loose relay loads credentiallessly through the canonical pipeline",
    from: "credentials: 'omit',\n                        redirect: 'manual',\n                        referrerPolicy: 'no-referrer',",
    to: "credentials: 'include',\n                        redirect: 'manual',\n                        referrerPolicy: 'no-referrer',",
  },
  {
    name: "loose relay package-root integrity removal",
    file: LOADER,
    testFile: CONTRACT,
    testName: "canonical loose relay factory requires and verifies an independent manifest-root pin",
    from: "await verifyWholePackageIntegrity(response.bytes, packageIntegrity);",
    to: "/* loose relay package-root verification removed */",
  },
  {
    name: "bundled relay package-root integrity removal",
    file: LOADER,
    testFile: BUNDLE_CONTRACT,
    testName: "relay bundle requires and verifies independently supplied whole-package integrity",
    replacements: [
      {
        from: "await verifyWholePackageIntegrity(response.bytes, packageIntegrity);",
        to: "if (!packageUrl.pathname.endsWith('.wsp') && !packageUrl.pathname.endsWith('.wso')) await verifyWholePackageIntegrity(response.bytes, packageIntegrity);",
      },
      {
        from: "looseSource.readManifest(signal).then(\n                async ({ bytes }) =>\n                {\n                    await verifyWholePackageIntegrity(bytes, packageIntegrity);",
        to: "looseSource.readManifest(signal).then(\n                async ({ bytes }) =>\n                {\n                    /* bundled relay package-root verification removed */",
      },
    ],
  },
  {
    name: "private anonymous relay downgrade",
    file: CONTENT_LOADER,
    testFile: CONTRACT,
    testName: "authenticated plain-URL navigation fails closed without a public relay offer",
    from: "navigationPolicy.mode === 'authenticated' &&\n                isRelayRetryOfferableError(error)",
    to: "navigationPolicy.mode === 'public-relay' &&\n                isRelayRetryOfferableError(error)",
  },
  {
    name: "fallback on integrity/schema/authentication failure",
    file: LOADER,
    testFile: CONTRACT,
    testName: "only direct transport/browser/CORS unavailability is eligible for bridge fallback",
    from: "error.category === 'transport' &&\n        DIRECT_BRIDGE_FALLBACK_CODES.has(error.code)",
    to: "['transport', 'integrity', 'schema', 'authentication'].includes(error.category)",
  },
  {
    name: "source failure teardown removal",
    file: LOADER,
    testFile: CONTRACT,
    testName: "typed R2 failure classes surface through ContentLoader with bounded teardown",
    from: "await closeRuntime(reason);\n        await closeSource(reason);",
    to: "await closeRuntime(reason);\n        /* source failure teardown removed */",
  },
  {
    name: "runtime failure teardown removal",
    file: LOADER,
    testFile: CONTRACT,
    testName: "runtime load failure tears down the runtime exactly once",
    from: "await closeRuntime(reason);\n        await closeSource(reason);",
    to: "/* runtime failure teardown removed */\n        await closeSource(reason);",
  },
  {
    name: "bridge iframe teardown removal",
    file: LOADER,
    testFile: CONNECTOR_CONTRACT,
    testName: "production iframe connector abort removes iframe and prevents runtime",
    from: "channel.port1.close();\n        iframe.remove();",
    to: "channel.port1.close();\n        /* iframe teardown removed */",
  },
];

async function stageBrowser(browserRoot, destination) {
  await cp(browserRoot, destination, {
    recursive: true,
    filter: (source) => path.basename(source) !== ".git" && path.basename(source) !== "node_modules",
  });
}

export async function verifyAuditedBrowserCheckout({ browserRoot, expectedCommit }) {
  assert.match(expectedCommit || "", /^[0-9a-f]{40}$/, "expected Browser commit must be a full SHA");
  const git = async (args) => {
    try {
      const result = await execFileAsync("git", ["-C", browserRoot, ...args], {
        maxBuffer: 1024 * 1024,
      });
      return result.stdout.trim();
    } catch (error) {
      throw new Error(`WEBSPACE_BROWSER_ROOT is not a usable Git checkout: ${error.stderr || error.message}`);
    }
  };
  assert.equal(await git(["rev-parse", "--is-inside-work-tree"]), "true", "Browser root must be a Git checkout");
  const [providedRoot, gitRoot] = await Promise.all([
    realpath(browserRoot),
    git(["rev-parse", "--show-toplevel"]).then((value) => realpath(value)),
  ]);
  assert.equal(
    providedRoot,
    gitRoot,
    "WEBSPACE_BROWSER_ROOT itself must be the audited Git worktree root",
  );
  const head = await git(["rev-parse", "HEAD"]);
  assert.equal(head, expectedCommit, `Browser HEAD must equal audited canonical commit ${expectedCommit}`);
  const dirty = await git(["status", "--porcelain=v1", "--untracked-files=all"]);
  assert.equal(dirty, "", "audited Browser checkout must be clean");
  return head;
}

export async function auditP1BBoundaryMutations({
  browserRoot,
  expectedCommit,
  onStage,
}) {
  await verifyAuditedBrowserCheckout({ browserRoot, expectedCommit });
  const temporary = await mkdtemp(path.join(os.tmpdir(), "p1b-browser-mutations-"));
  let cleanupCount = 0;
  const cleanup = async () => {
    cleanupCount++;
    assert.equal(cleanupCount, 1, "temporary Browser mutation workspace must be cleaned exactly once");
    await rm(temporary, { recursive: true, force: true });
  };

  try {
    onStage?.();
    const baselineRoot = path.join(temporary, "baseline");
    await stageBrowser(browserRoot, baselineRoot);

    const distinctTests = new Map();
    for (const mutation of mutations) {
      distinctTests.set(`${mutation.testFile}\0${mutation.testName}`, mutation);
    }
    for (const mutation of distinctTests.values()) {
      const baseline = await runTest(baselineRoot, mutation.testFile, mutation.testName);
      assert.equal(
        baseline.code,
        0,
        `baseline failed for ${mutation.testName}\n${baseline.output}`,
      );
    }

    const controlRoot = path.join(temporary, "control");
    await stageBrowser(baselineRoot, controlRoot);
    const controlFile = path.join(controlRoot, LOADER);
    await writeFile(controlFile, `${await readFile(controlFile, "utf8")}\n// harmless P1B mutation-runner control\n`);
    const control = await runTest(
      controlRoot,
      CONTRACT,
      "only direct transport/browser/CORS unavailability is eligible for bridge fallback",
    );
    assert.equal(control.code, 0, `harmless control mutation must survive\n${control.output}`);

    const killed = [];
    for (const mutation of mutations) {
      const mutationRoot = path.join(temporary, `mutation-${killed.length + 1}`);
      await stageBrowser(baselineRoot, mutationRoot);
      const target = path.join(mutationRoot, mutation.file);
      const original = await readFile(target, "utf8");
      const replacements = mutation.replacements || [{ from: mutation.from, to: mutation.to }];
      const changed = replacements.reduce(
        (source, replacement, index) => replaceRequired(
          source,
          replacement.from,
          replacement.to,
          `${mutation.name} replacement ${index + 1}`,
        ),
        original,
      );
      await writeFile(target, changed);
      assert.equal(await readFile(target, "utf8"), changed, `${mutation.name} must be written to copied Browser`);

      const result = await runTest(mutationRoot, mutation.testFile, mutation.testName);
      assert.notEqual(result.code, 0, `${mutation.name} survived ${mutation.testName}\n${result.output}`);
      assert.ok(
        result.output.includes(mutation.testName),
        `${mutation.name} failure was not attributable to ${mutation.testName}\n${result.output}`,
      );
      killed.push({
        name: mutation.name,
        file: mutation.file,
        failingTest: mutation.testName,
      });
    }
    return { control: "harmless comment", killed };
  } finally {
    await cleanup();
  }
}
