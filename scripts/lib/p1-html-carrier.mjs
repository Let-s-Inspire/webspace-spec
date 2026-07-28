import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildZip, manifest, sri } from "./p1-container-contract.mjs";

const encoder = new TextEncoder();

function carrierFixture(kind, { mutateManifest, entryBytes } = {}) {
  const entry = entryBytes ?? encoder.encode(`export const carrierKind = ${JSON.stringify(kind)};`);
  const value = manifest(kind, `resources/${kind}.js`, entry);
  value.capabilities = [{
    name: "com.example.carrier",
    required: true,
    reason: "Exercise negotiation after carrier validation.",
  }];
  mutateManifest?.(value);
  const manifestBytes = encoder.encode(JSON.stringify(value));
  return {
    kind,
    entry,
    manifest: value,
    bytes: buildZip([
      { name: "manifest.json", bytes: manifestBytes },
      { name: `resources/${kind}.js`, bytes: entry },
    ]),
  };
}

function bridgeBytes(url, bytes) {
  const body = bytes.slice().buffer;
  return { url, mediaType: "application/webspace-package", byteLength: body.byteLength, body };
}

function connectCarrier(fixture, {
  origin = "https://publisher.example",
  bundleResult,
  events = [],
  closeCount = { value: 0 },
} = {}) {
  return async (options) => {
    assert.equal(options.bridgeUrl, `https://publisher.example/${fixture.kind}-carrier.html`);
    assert.equal(options.expectedOrigin, "https://publisher.example");
    assert.equal(options.carrier, true);
    return {
      origin,
      async request(type) {
        events.push(type);
        if (type === "webspace.bridge.describe") return { representation: "bundle" };
        if (type === "webspace.bridge.bundle") {
          return bundleResult === undefined
            ? bridgeBytes(options.bridgeUrl, fixture.bytes)
            : bundleResult;
        }
        throw new Error(`unexpected carrier request ${type}`);
      },
      async close() {
        closeCount.value++;
        events.push("close");
      },
    };
  };
}

function carrierSource(api, fixture, options = {}) {
  return api.createWebspacePackageSource({
    url: `https://publisher.example/${fixture.kind}-carrier.html`,
    carrier: true,
    kind: fixture.kind,
    packageIntegrity: options.packageIntegrity ?? sri(fixture.bytes),
  }, {
    connectBridge: options.connectBridge ?? connectCarrier(fixture, options),
    limits: options.limits,
  });
}

async function run(api, fixture, options = {}) {
  let runtimeCreated = 0;
  let executed = 0;
  let negotiated = 0;
  let failure;
  const source = options.source ?? carrierSource(api, fixture, options);
  try {
    await api.loadWebspacePackage({
      source,
      expectedKind: options.expectedKind ?? fixture.kind,
      signal: options.signal,
      negotiateCapabilities: async ({ manifest: value }) => {
        negotiated++;
        if (options.denyCapability) return [];
        return value.capabilities.map(({ name }) => ({ name, decision: "granted" }));
      },
      createRuntime: async () => {
        runtimeCreated++;
        return { async load() { executed++; } };
      },
    });
  } catch (error) {
    failure = error;
  }
  return { failure, runtimeCreated, executed, negotiated };
}

async function mustReject(api, fixture, label, options = {}) {
  const result = await run(api, fixture, options);
  assert.ok(result.failure, `${label} must fail`);
  assert.equal(result.runtimeCreated, 0, `${label} must fail before runtime creation`);
  assert.equal(result.executed, 0, `${label} must fail before execution`);
  return result;
}

export async function auditHtmlCarrier({ api }) {
  const positives = [];
  for (const kind of ["world", "object"]) {
    const fixture = carrierFixture(kind);
    const events = [];
    const closeCount = { value: 0 };
    const result = await run(api, fixture, { events, closeCount });
    assert.ifError(result.failure);
    assert.equal(result.executed, 1);
    assert.equal(result.negotiated, 1);
    assert.equal(closeCount.value, 1);
    assert.deepEqual(events, [
      "webspace.bridge.describe",
      "webspace.bridge.bundle",
      "close",
    ]);
    positives.push(kind);

    await mustReject(api, fixture, `${kind} bad package root`, {
      packageIntegrity: sri(encoder.encode("wrong complete bundle")),
    });
    await mustReject(api, fixture, `${kind} kind mismatch`, {
      expectedKind: kind === "world" ? "object" : "world",
    });
    await mustReject(api, fixture, `${kind} denied required capability`, {
      denyCapability: true,
    });
  }

  const world = carrierFixture("world");
  await mustReject(api, world, "zero bundles", {
    connectBridge: connectCarrier(world, { bundleResult: null }),
  });
  await mustReject(api, world, "multiple bundles", {
    connectBridge: connectCarrier(world, { bundleResult: [
      bridgeBytes("https://publisher.example/world-carrier.html", world.bytes),
      bridgeBytes("https://publisher.example/world-carrier.html", world.bytes),
    ] }),
  });
  await mustReject(api, world, "malformed bundle", {
    connectBridge: connectCarrier(world, {
      bundleResult: bridgeBytes("https://publisher.example/world-carrier.html", encoder.encode("not zip")),
    }),
  });
  await mustReject(api, world, "oversized extraction", {
    limits: { packageBytes: world.bytes.byteLength - 1 },
  });
  await mustReject(api, world, "publisher origin mismatch", {
    connectBridge: connectCarrier(world, { origin: "https://attacker.example" }),
  });
  const badSchema = carrierFixture("world", { mutateManifest: (value) => { value.unexpected = true; } });
  await mustReject(api, badSchema, "schema bypass attempt");
  const tamperedEntry = carrierFixture("world");
  tamperedEntry.bytes = buildZip([
    { name: "manifest.json", bytes: encoder.encode(JSON.stringify(tamperedEntry.manifest)) },
    { name: "resources/world.js", bytes: encoder.encode("tampered") },
  ]);
  await mustReject(api, tamperedEntry, "bad entry integrity");

  const controller = new AbortController();
  controller.abort(new Error("test abort"));
  const closeCount = { value: 0 };
  await mustReject(api, world, "aborted carrier", {
    signal: controller.signal,
    closeCount,
  });
  assert.equal(closeCount.value, 1, "aborted carrier must tear down exactly once");
  return { positives };
}

function replaceRequired(source, from, to, label) {
  assert.ok(source.includes(from), `${label} mutation target must exist`);
  return source.replace(from, to);
}

async function importMutation(tempRoot, source, name) {
  const file = path.join(tempRoot, `${name}.mjs`);
  await writeFile(file, source);
  return import(`${pathToFileURL(file).href}?mutation=${Date.now()}`);
}

export async function auditCarrierSourceMutations({ browserRoot }) {
  const source = await readFile(
    path.join(browserRoot, "client/js/ContentNavigator/WebspacePackageLoader.js"),
    "utf8",
  );
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "p1-carrier-mutations-"));
  try {
    const validationBypass = replaceRequired(
      source,
      `const manifest = expectedKind === 'world'\n            ? validateExperimentalWorldManifest(decodedManifest, expectedKind)\n            : validateExperimentalObjectManifest(decodedManifest, expectedKind);`,
      "const manifest = decodedManifest;",
      "validation bypass",
    );
    const bypassApi = await importMutation(tempRoot, validationBypass, "validation-bypass");
    const invalid = carrierFixture("world", { mutateManifest: (value) => { value.unexpected = true; } });
    const bypass = await run(bypassApi, invalid);
    assert.equal(bypass.executed, 1, "validation-bypass mutation must be exposed by the invalid fixture");

    const carrierScript = replaceRequired(
      source,
      "if (carrier && result.representation !== 'bundle')",
      "if (carrier) { globalThis.__p1CarrierScriptExecuted(); }\n                if (carrier && result.representation !== 'bundle')",
      "carrier script execution",
    );
    let carrierScriptExecutions = 0;
    globalThis.__p1CarrierScriptExecuted = () => { carrierScriptExecutions++; };
    try {
      const scriptApi = await importMutation(tempRoot, carrierScript, "carrier-script");
      const result = await run(scriptApi, carrierFixture("world"));
      assert.ifError(result.failure);
      assert.equal(carrierScriptExecutions, 1, "carrier-script execution mutation must be observable");
    } finally {
      delete globalThis.__p1CarrierScriptExecuted;
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
  return ["validation bypass", "carrier script execution"];
}
