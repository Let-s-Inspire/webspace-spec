import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { deflateRawSync } from "node:zlib";
import { pathToFileURL } from "node:url";
import os from "node:os";
import path from "node:path";

const encoder = new TextEncoder();

function concat(parts) {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function buildZip(entries) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const body = entry.bytes ?? new Uint8Array();
    const compressed = entry.deflate ? new Uint8Array(deflateRawSync(body)) : body;
    const method = entry.method ?? (entry.deflate ? 8 : 0);
    const local = new Uint8Array(30 + name.byteLength + compressed.byteLength);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, method, true);
    localView.setUint32(14, crc32(body), true);
    localView.setUint32(18, compressed.byteLength, true);
    localView.setUint32(22, body.byteLength, true);
    localView.setUint16(26, name.byteLength, true);
    local.set(name, 30);
    local.set(compressed, 30 + name.byteLength);
    localParts.push(local);

    const central = new Uint8Array(46 + name.byteLength);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, method, true);
    centralView.setUint32(16, crc32(body), true);
    centralView.setUint32(20, compressed.byteLength, true);
    centralView.setUint32(24, body.byteLength, true);
    centralView.setUint16(28, name.byteLength, true);
    centralView.setUint32(38, 0x81a40000, true);
    centralView.setUint32(42, localOffset, true);
    central.set(name, 46);
    centralParts.push(central);
    localOffset += local.byteLength;
  }
  const central = concat(centralParts);
  const end = new Uint8Array(22);
  const view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, entries.length, true);
  view.setUint16(10, entries.length, true);
  view.setUint32(12, central.byteLength, true);
  view.setUint32(16, localOffset, true);
  return concat([...localParts, central, end]);
}

function sri(bytes) {
  return `sha256-${createHash("sha256").update(bytes).digest("base64")}`;
}

function manifest(kind, entryPath, entryBytes) {
  const common = {
    $schema: `https://webspacebrowser.com/schemas/experimental/v0/${kind}.schema.json`,
    profile: "https://webspacebrowser.com/profiles/package/experimental-v0",
    kind,
    id: `com.example.container-${kind}`,
    version: "0.1.0",
    metadata: { name: `Container ${kind}` },
    entry: { module: `package:/${entryPath}`, integrity: sri(entryBytes) },
  };
  return kind === "world"
    ? {
        ...common,
        presentation: { backgroundColor: "#123456" },
        entrances: [{
          id: "main",
          transform: { position: [0, 0, 0], orientation: [0, 0, 0, 1] },
        }],
        defaultEntrance: "main",
      }
    : {
        ...common,
        bounds: { size: [1, 1, 1] },
        ownership: { initial: "world" },
        multiplicity: { perWorld: 1, perUser: 1 },
      };
}

function bundle(kind, {
  entryPath = `resources/${kind}.js`,
  entryBytes = encoder.encode("export default {};"),
  entries,
  deflateEntry = false,
} = {}) {
  const value = manifest(kind, entryPath, entryBytes);
  return {
    kind,
    manifest: value,
    bytes: buildZip(entries ?? [
      { name: "manifest.json", bytes: encoder.encode(JSON.stringify(value)) },
      { name: entryPath, bytes: entryBytes, deflate: deflateEntry },
    ]),
  };
}

function response(bytes, kind) {
  return {
    status: 200,
    ok: true,
    type: "basic",
    url: `https://packages.example/test.${kind === "world" ? "wsp" : "wso"}`,
    headers: { get: () => null },
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
  };
}

export async function loadBrowserContainerApi(browserRoot) {
  return import(
    `${pathToFileURL(path.join(browserRoot, "client/js/ContentNavigator/WebspacePackageLoader.js")).href}?container=${Date.now()}`
  );
}

export async function runContainer(api, fixture, { limits = {}, expectedKind = fixture.kind } = {}) {
  let runtimeCreated = 0;
  let executed = 0;
  let failure;
  const source = api.createDirectBundlePackageSource(
    `https://packages.example/test.${expectedKind === "world" ? "wsp" : "wso"}`,
    { limits, fetchImpl: async () => response(fixture.bytes, expectedKind) },
  );
  try {
    await api.loadWebspacePackage({
      source,
      expectedKind,
      negotiateCapabilities: async () => [],
      createRuntime: async () => {
        runtimeCreated++;
        return { async load() { executed++; } };
      },
    });
  } catch (error) {
    failure = error;
  }
  return { failure, runtimeCreated, executed };
}

function invalidFixtures() {
  const world = bundle("world");
  const object = bundle("object");
  const manifestBytes = encoder.encode(JSON.stringify(world.manifest));
  const entryBytes = encoder.encode("export default {};");
  const deepPath = "a/b/c/world.js";
  const repetitive = encoder.encode("x".repeat(4096));
  return [
    {
      name: "duplicate path",
      fixture: bundle("world", { entries: [
        { name: "manifest.json", bytes: manifestBytes },
        { name: "resources/world.js", bytes: entryBytes },
        { name: "resources/world.js", bytes: entryBytes },
      ] }),
    },
    {
      name: "duplicate manifest",
      fixture: bundle("world", { entries: [
        { name: "manifest.json", bytes: manifestBytes },
        { name: "manifest.json", bytes: manifestBytes },
        { name: "resources/world.js", bytes: entryBytes },
      ] }),
    },
    { name: "missing manifest", fixture: { ...world, bytes: buildZip([{ name: "resources/world.js", bytes: entryBytes }]) } },
    { name: "wrong world kind", fixture: object, expectedKind: "world" },
    { name: "wrong object kind", fixture: world, expectedKind: "object" },
    { name: "traversal path", fixture: bundle("world", { entryPath: "../world.js" }) },
    { name: "absolute path", fixture: bundle("world", { entryPath: "/world.js" }) },
    { name: "encoded traversal path", fixture: bundle("world", { entryPath: "%2e%2e/world.js" }) },
    {
      name: "unsupported compression",
      fixture: bundle("world", { entries: [
        { name: "manifest.json", bytes: manifestBytes },
        { name: "resources/world.js", bytes: entryBytes, method: 12 },
      ] }),
    },
    { name: "truncated archive", fixture: { ...world, bytes: world.bytes.slice(0, -11) } },
    {
      name: "entry count bound",
      fixture: world,
      limits: { entries: 1 },
      relaxed: { entries: 2 },
      bound: "entry count",
    },
    {
      name: "compressed archive bound",
      fixture: world,
      limits: { containerBytes: world.bytes.byteLength - 1 },
      relaxed: { containerBytes: world.bytes.byteLength },
      bound: "compressed size",
    },
    {
      name: "expanded total bound",
      fixture: world,
      limits: { expandedBytes: manifestBytes.byteLength + entryBytes.byteLength - 1 },
      relaxed: { expandedBytes: manifestBytes.byteLength + entryBytes.byteLength },
      bound: "expanded size",
    },
    {
      name: "per-entry bound",
      fixture: world,
      limits: { perEntryBytes: manifestBytes.byteLength - 1 },
      relaxed: { perEntryBytes: manifestBytes.byteLength },
      bound: "per-entry size",
    },
    {
      name: "compression ratio bound",
      fixture: bundle("world", { entryBytes: repetitive, deflateEntry: true }),
      limits: { compressionRatio: 2 },
      relaxed: { compressionRatio: 1000 },
      bound: "compression ratio",
    },
    {
      name: "path depth bound",
      fixture: bundle("world", { entryPath: deepPath }),
      limits: { pathDepth: 3 },
      relaxed: { pathDepth: 4 },
      bound: "path depth",
    },
  ];
}

export async function auditContainers({ browserRoot, validateSpec }) {
  const api = await loadBrowserContainerApi(browserRoot);
  const positives = [bundle("world"), bundle("object")];
  for (const positive of positives) {
    assert.equal(validateSpec(positive.manifest, positive.kind), true, `${positive.kind} manifest must pass canonical Spec schema`);
    const result = await runContainer(api, positive);
    assert.ifError(result.failure);
    assert.equal(result.executed, 1);
  }
  const negatives = [];
  const mutations = [];
  for (const item of invalidFixtures()) {
    const result = await runContainer(api, item.fixture, {
      limits: item.limits,
      expectedKind: item.expectedKind,
    });
    assert.ok(result.failure, `${item.name} must fail`);
    assert.equal(result.runtimeCreated, 0, `${item.name} must fail before runtime creation`);
    assert.equal(result.executed, 0, `${item.name} must fail before execution`);
    negatives.push(item.name);
    if (item.bound) {
      const relaxed = await runContainer(api, item.fixture, { limits: item.relaxed });
      assert.ifError(relaxed.failure);
      assert.equal(relaxed.executed, 1, `removing ${item.bound} must make the mutation observable`);
      mutations.push(item.bound);
    }
  }
  return { positives: positives.map(({ kind }) => kind), negatives, mutations };
}

function defaultMutationCases() {
  const ordinary = bundle("world");
  const threeEntries = bundle("world", {
    entries: [
      { name: "manifest.json", bytes: encoder.encode(JSON.stringify(ordinary.manifest)) },
      { name: "resources/world.js", bytes: encoder.encode("export default {};") },
      { name: "resources/extra.js", bytes: encoder.encode("export {};") },
    ],
  });
  const largeEntry = encoder.encode("x".repeat(2048));
  const perEntry = bundle("world", { entryBytes: largeEntry });
  const compressed = bundle("world", {
    entryBytes: encoder.encode("x".repeat(4096)),
    deflateEntry: true,
  });
  const deep = bundle("world", { entryPath: "a/b/c/d/world.js" });
  const manifestSize = encoder.encode(JSON.stringify(ordinary.manifest)).byteLength;
  const expandedTotal = manifestSize + encoder.encode("export default {};").byteLength;
  const archiveThreshold = expandedTotal + 8;
  assert.ok(ordinary.bytes.byteLength > archiveThreshold);
  return [
    {
      name: "entry count",
      fixture: threeEntries,
      control: ["const DEFAULT_CONTAINER_ENTRIES = 4096;", "const DEFAULT_CONTAINER_ENTRIES = 2;"],
      removed: ["const DEFAULT_CONTAINER_ENTRIES = 4096;", "const DEFAULT_CONTAINER_ENTRIES = 100000;"],
    },
    {
      name: "compressed size",
      fixture: ordinary,
      control: [
        "const containerLimit = finiteLimit(limits.containerBytes, DEFAULT_CONTAINER_BYTES);",
        `const containerLimit = finiteLimit(limits.containerBytes, ${archiveThreshold});`,
      ],
      removed: [
        "const containerLimit = finiteLimit(limits.containerBytes, DEFAULT_CONTAINER_BYTES);",
        "const containerLimit = finiteLimit(limits.containerBytes, Number.MAX_SAFE_INTEGER);",
      ],
    },
    {
      name: "expanded size",
      fixture: ordinary,
      control: [
        "const expandedLimit = finiteLimit(limits.expandedBytes, DEFAULT_CONTAINER_BYTES);",
        `const expandedLimit = finiteLimit(limits.expandedBytes, ${expandedTotal - 1});`,
      ],
      removed: [
        "const expandedLimit = finiteLimit(limits.expandedBytes, DEFAULT_CONTAINER_BYTES);",
        "const expandedLimit = finiteLimit(limits.expandedBytes, Number.MAX_SAFE_INTEGER);",
      ],
    },
    {
      name: "per-entry size",
      fixture: perEntry,
      control: [
        "const perEntryLimit = finiteLimit(limits.perEntryBytes, DEFAULT_RESOURCE_BYTES);",
        "const perEntryLimit = finiteLimit(limits.perEntryBytes, 1024);",
      ],
      removed: [
        "const perEntryLimit = finiteLimit(limits.perEntryBytes, DEFAULT_RESOURCE_BYTES);",
        "const perEntryLimit = finiteLimit(limits.perEntryBytes, Number.MAX_SAFE_INTEGER);",
      ],
    },
    {
      name: "compression ratio",
      fixture: compressed,
      control: ["const DEFAULT_CONTAINER_COMPRESSION_RATIO = 1000;", "const DEFAULT_CONTAINER_COMPRESSION_RATIO = 2;"],
      removed: ["const DEFAULT_CONTAINER_COMPRESSION_RATIO = 1000;", "const DEFAULT_CONTAINER_COMPRESSION_RATIO = Number.MAX_SAFE_INTEGER;"],
    },
    {
      name: "path depth",
      fixture: deep,
      control: ["const DEFAULT_CONTAINER_PATH_DEPTH = 64;", "const DEFAULT_CONTAINER_PATH_DEPTH = 4;"],
      removed: ["const DEFAULT_CONTAINER_PATH_DEPTH = 64;", "const DEFAULT_CONTAINER_PATH_DEPTH = Number.MAX_SAFE_INTEGER;"],
    },
  ];
}

function replaceRequired(source, [from, to], label) {
  const occurrences = source.split(from).length - 1;
  assert.ok(occurrences > 0, `${label}: Browser source mutation target must exist`);
  return source.replaceAll(from, to);
}

async function runMutatedModule(tempRoot, source, label, fixture) {
  const file = path.join(tempRoot, `${label.replaceAll(" ", "-")}.mjs`);
  await writeFile(file, source);
  const api = await import(`${pathToFileURL(file).href}?run=${Date.now()}`);
  return runContainer(api, fixture);
}

export async function auditCanonicalDefaultMutations({ browserRoot }) {
  const loaderPath = path.join(browserRoot, "client/js/ContentNavigator/WebspacePackageLoader.js");
  const source = await readFile(loaderPath, "utf8");
  const exactDefaults = new Map([
    ["compressed and expanded bytes", "const DEFAULT_CONTAINER_BYTES = 256 * 1024 * 1024;"],
    ["entry count", "const DEFAULT_CONTAINER_ENTRIES = 4096;"],
    ["per-entry bytes", "const DEFAULT_RESOURCE_BYTES = 64 * 1024 * 1024;"],
    ["compression ratio", "const DEFAULT_CONTAINER_COMPRESSION_RATIO = 1000;"],
    ["path depth", "const DEFAULT_CONTAINER_PATH_DEPTH = 64;"],
  ]);
  for (const [name, declaration] of exactDefaults) {
    assert.ok(source.includes(declaration), `${name} canonical finite default changed or disappeared`);
  }

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "p1-container-mutations-"));
  const results = [];
  try {
    for (const item of defaultMutationCases()) {
      const controlSource = replaceRequired(source, item.control, `${item.name} control`);
      const removedSource = replaceRequired(source, item.removed, `${item.name} removal`);
      const control = await runMutatedModule(tempRoot, controlSource, `${item.name}-control`, item.fixture);
      assert.ok(control.failure, `${item.name} default enforcement control must reject`);
      assert.equal(control.runtimeCreated, 0, `${item.name} control must reject before runtime`);
      assert.equal(control.executed, 0, `${item.name} control must reject before execution`);
      const removed = await runMutatedModule(tempRoot, removedSource, `${item.name}-removed`, item.fixture);
      assert.ifError(removed.failure);
      assert.equal(removed.executed, 1, `${item.name} removal mutation must reach execution`);
      results.push(item.name);
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
  return {
    defaults: [...exactDefaults.keys()],
    removals: results,
  };
}
