import assert from "node:assert/strict";
import { bundle, buildZip, manifest, sri } from "./p1-container-contract.mjs";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const relay = { url: "https://relay.example/fetch", parameter: "url", operator: "Test Relay" };

function response(bytes, url = "https://relay.example/fetch") {
  return {
    status: 200,
    ok: true,
    type: "basic",
    url,
    headers: { get: () => "application/octet-stream" },
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
  };
}

function logicalFixture(kind) {
  const entryPath = `code/${kind}/entry.js`;
  const modulePath = `code/${kind}/nested/helper.js`;
  const assetPath = `assets/${kind}/textures/pixel%20one.bin`;
  const assetArchivePath = `assets/${kind}/textures/pixel one.bin`;
  const entry = encoder.encode(`export const kind = ${JSON.stringify(kind)};`);
  const module = encoder.encode(`export const nested = ${JSON.stringify(kind)};`);
  const asset = new Uint8Array([1, 3, 3, 7, kind === "world" ? 1 : 2]);
  const value = manifest(kind, entryPath, entry);
  value.modules = [{ id: "helper", module: `package:/${modulePath}`, integrity: sri(module), phase: "lazy" }];
  value.assets = [{ id: "pixel", url: `package:/${assetPath}`, mediaType: "application/octet-stream", integrity: sri(asset), bytes: asset.byteLength }];
  const manifestBytes = encoder.encode(JSON.stringify(value));
  const archiveBytes = buildZip([
    { name: "manifest.json", bytes: manifestBytes },
    { name: entryPath, bytes: entry },
    { name: modulePath, bytes: module },
    { name: assetArchivePath, bytes: asset },
    { name: "undeclared/inert.js", bytes: encoder.encode("throw new Error('must stay inert')") },
  ]);
  return { kind, entryPath, modulePath, assetPath, assetArchivePath, entry, module, asset, manifest: value, manifestBytes, archiveBytes };
}

function relayFetch(fixture, representation, { missing, requests, overrideEntry, overrideModule } = {}) {
  return async (url, options) => {
    assert.equal(options.credentials, "omit");
    const relayUrl = new URL(url);
    const target = new URL(relayUrl.searchParams.get("url"));
    requests.push(target.href);
    if (representation === "bundle") return response(fixture.archiveBytes);
    if (target.pathname.endsWith(fixture.kind === "world" ? ".wsp.json" : ".wso.json")) {
      return response(fixture.manifestBytes);
    }
    const normalizedPath = decodeURIComponent(target.pathname).split("/packages/").at(-1);
    if (missing === normalizedPath) return { ...response(new Uint8Array()), status: 404, ok: false };
    const resources = new Map([
      [fixture.entryPath, overrideEntry ?? fixture.entry],
      [fixture.modulePath, overrideModule ?? fixture.module],
      [fixture.assetArchivePath, fixture.asset],
      ["encoded path/file.js", encoder.encode("export const encoded = true;")],
    ]);
    const bytes = resources.get(normalizedPath);
    return bytes ? response(bytes) : { ...response(new Uint8Array()), status: 404, ok: false };
  };
}

function source(api, fixture, representation, options = {}) {
  const extension = representation === "bundle"
    ? (fixture.kind === "world" ? "wsp" : "wso")
    : (fixture.kind === "world" ? "wsp.json" : "wso.json");
  const url = `https://publisher.example/packages/test.${extension}`;
  let bundleBytes = fixture.archiveBytes;
  if (representation === "bundle" && (options.overrideEntry || options.overrideModule || options.missing)) {
    bundleBytes = buildZip([
      { name: "manifest.json", bytes: fixture.manifestBytes },
      { name: fixture.entryPath, bytes: options.overrideEntry ?? fixture.entry },
      ...(options.missing === fixture.modulePath ? [] : [{
        name: fixture.modulePath,
        bytes: options.overrideModule ?? fixture.module,
      }]),
      ...(options.missing === fixture.assetArchivePath ? [] : [{ name: fixture.assetArchivePath, bytes: fixture.asset }]),
    ]);
  }
  const effectiveFixture = { ...fixture, archiveBytes: bundleBytes };
  const packageIntegrity = options.packageIntegrity ??
    sri(representation === "bundle" ? bundleBytes : fixture.manifestBytes);
  const factory = representation === "bundle"
    ? api.createRelayBundlePackageSource
    : api.createRelayLoosePackageSource;
  return factory(url, {
    relay,
    packageIntegrity,
    fetchImpl: relayFetch(effectiveFixture, representation, options),
  });
}

async function load(api, packageSource, kind) {
  let runtimeCreated = 0;
  let executed = 0;
  let entry;
  let failure;
  try {
    await api.loadWebspacePackage({
      source: packageSource,
      expectedKind: kind,
      negotiateCapabilities: async () => [],
      createRuntime: async ({ entry: loadedEntry }) => {
        runtimeCreated++;
        entry = loadedEntry.bytes;
        return { async load() { executed++; } };
      },
    });
  } catch (error) {
    failure = error;
  }
  return { failure, runtimeCreated, executed, entry };
}

async function expectPreExecutionFailure(api, packageSource, kind, label) {
  const result = await load(api, packageSource, kind);
  assert.ok(result.failure, `${label} must fail`);
  assert.equal(result.runtimeCreated, 0, `${label} must fail before runtime creation`);
  assert.equal(result.executed, 0, `${label} must fail before execution`);
}

export async function auditLogicalEquivalence({ api, validateSpec }) {
  const passed = [];
  for (const kind of ["world", "object"]) {
    const fixture = logicalFixture(kind);
    assert.equal(validateSpec(fixture.manifest, kind), true);
    const loaded = {};
    for (const representation of ["loose", "bundle"]) {
      const requests = [];
      const result = await load(api, source(api, fixture, representation, { requests }), kind);
      assert.ifError(result.failure);
      assert.equal(result.executed, 1);
      assert.deepEqual(result.entry, fixture.entry);
      assert.ok(!requests.some((url) => url.includes("undeclared/inert.js")), "undeclared archive content must remain inert");
      loaded[representation] = result.entry;

      const inspectionRequests = [];
      const inspection = source(api, fixture, representation, { requests: inspectionRequests });
      await inspection.readManifest();
      const nested = await inspection.readResource(`package:/${fixture.modulePath}`);
      const asset = await inspection.readResource(`package:/${fixture.assetPath}`);
      assert.deepEqual(nested.bytes, fixture.module);
      assert.deepEqual(asset.bytes, fixture.asset);
      const rejectsRead = (reference) =>
        assert.rejects(Promise.resolve().then(() => inspection.readResource(reference)));
      await rejectsRead("package:/missing/resource.js");
      await rejectsRead("package:/code/file.js?x=1");
      await rejectsRead("package:/code/file.js#fragment");
      await rejectsRead("package:/../escape.js");
      await inspection.close();

      const missingDeclared = source(api, fixture, representation, {
        requests: [],
        missing: fixture.modulePath,
      });
      await missingDeclared.readManifest();
      await assert.rejects(Promise.resolve().then(
        () => missingDeclared.readResource(`package:/${fixture.modulePath}`),
      ));
      await missingDeclared.close();
      passed.push(`${kind} ${representation}`);
    }
    assert.deepEqual(loaded.loose, loaded.bundle, `${kind} entry bytes must be representation-independent`);

    for (const representation of ["loose", "bundle"]) {
      await expectPreExecutionFailure(
        api,
        source(api, fixture, representation, {
          requests: [],
          overrideEntry: encoder.encode("tampered entry"),
        }),
        kind,
        `${kind} ${representation} bad entry integrity`,
      );
      await expectPreExecutionFailure(
        api,
        source(api, fixture, representation, {
          requests: [],
          packageIntegrity: sri(fixture.entry),
        }),
        kind,
        `${kind} ${representation} conflated package-root and entry integrity`,
      );
      await expectPreExecutionFailure(
        api,
        source(api, fixture, representation, { requests: [] }),
        kind === "world" ? "object" : "world",
        `${kind} ${representation} kind mismatch`,
      );
    }
  }
  return { passed };
}

export async function auditResolutionDriftMutation({ api }) {
  const fixture = logicalFixture("world");
  const driftedModule = new Uint8Array(fixture.module);
  driftedModule[0] ^= 1;
  const loose = source(api, fixture, "loose", {
    requests: [],
    overrideModule: driftedModule,
  });
  const bundleSource = source(api, fixture, "bundle", { requests: [] });
  await loose.readManifest();
  await bundleSource.readManifest();
  const reference = `package:/${fixture.modulePath}`;
  const looseBytes = (await loose.readResource(reference)).bytes;
  const bundleBytes = (await bundleSource.readResource(reference)).bytes;
  assert.throws(() => assert.deepEqual(looseBytes, bundleBytes), /Expected values to be strictly deep-equal/);
  await loose.close();
  await bundleSource.close();
  return "loose/bundle nested resolution drift";
}
