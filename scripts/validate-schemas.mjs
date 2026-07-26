import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaDir = path.join(root, "schemas", "experimental", "v0");
const fixtureDir = path.join(schemaDir, "fixtures");

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

const schemaFiles = [
  "package.schema.json",
  "world.schema.json",
  "object.schema.json",
  "origin-bridge-message.schema.json",
  "capability-negotiation.schema.json",
];
const schemas = await Promise.all(
  schemaFiles.map((file) => readJson(path.join(schemaDir, file))),
);

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  validateFormats: true,
});
addFormats(ajv);
for (const schema of schemas) {
  ajv.addSchema(schema);
}

const validators = {
  world: ajv.getSchema(
    "https://webspacebrowser.com/schemas/experimental/v0/world.schema.json",
  ),
  object: ajv.getSchema(
    "https://webspacebrowser.com/schemas/experimental/v0/object.schema.json",
  ),
  bridge: ajv.getSchema(
    "https://webspacebrowser.com/schemas/experimental/v0/origin-bridge-message.schema.json",
  ),
  capability: ajv.getSchema(
    "https://webspacebrowser.com/schemas/experimental/v0/capability-negotiation.schema.json",
  ),
};

function duplicates(items, key = (item) => item.id) {
  const seen = new Set();
  const repeated = new Set();
  for (const item of items ?? []) {
    const value = key(item);
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

function validateCommonSemantics(manifest) {
  const errors = [];
  for (const field of ["modules", "assets", "dependencies"]) {
    for (const id of duplicates(manifest[field], (item) => item.id)) {
      errors.push(`${field} contains duplicate id ${JSON.stringify(id)}`);
    }
  }

  const requiredFeatures = new Set(manifest.compatibility?.requires ?? []);
  for (const extension of Object.keys(manifest.extensions ?? {})) {
    if (!requiredFeatures.has(extension)) {
      errors.push(
        `extension ${JSON.stringify(extension)} must appear in compatibility.requires`,
      );
    }
  }
  return errors;
}

function validateWorldSemantics(manifest) {
  const errors = validateCommonSemantics(manifest);
  const entranceIds = new Set(manifest.entrances.map((item) => item.id));
  if (!entranceIds.has(manifest.defaultEntrance)) {
    errors.push("defaultEntrance must reference a declared entrance");
  }
  for (const id of duplicates(manifest.entrances)) {
    errors.push(`entrances contains duplicate id ${JSON.stringify(id)}`);
  }

  const zones = new Set((manifest.navigation?.zones ?? []).map((item) => item.id));
  for (const id of duplicates(manifest.navigation?.zones)) {
    errors.push(`navigation.zones contains duplicate id ${JSON.stringify(id)}`);
  }
  for (const edge of manifest.navigation?.edges ?? []) {
    if (!zones.has(edge.from) || !zones.has(edge.to)) {
      errors.push(
        `navigation edge ${JSON.stringify(edge.from)} -> ${JSON.stringify(edge.to)} references an unknown zone`,
      );
    }
  }
  for (const entrance of manifest.entrances) {
    if (entrance.zone !== undefined && !zones.has(entrance.zone)) {
      errors.push(`entrance ${JSON.stringify(entrance.id)} references an unknown zone`);
    }
  }
  for (const field of ["placementPolicy", "portalPolicy"]) {
    for (const zone of manifest[field]?.zones ?? []) {
      if (!zones.has(zone)) {
        errors.push(`${field} references unknown zone ${JSON.stringify(zone)}`);
      }
    }
  }
  for (const id of duplicates(manifest.objects)) {
    errors.push(`objects contains duplicate id ${JSON.stringify(id)}`);
  }
  return errors;
}

function validateObjectSemantics(manifest) {
  const errors = validateCommonSemantics(manifest);
  for (const id of duplicates(manifest.attachmentPoints)) {
    errors.push(`attachmentPoints contains duplicate id ${JSON.stringify(id)}`);
  }
  for (const direction of ["inputs", "outputs"]) {
    for (const id of duplicates(
      manifest.ports?.[direction],
      (item) => item.name,
    )) {
      errors.push(`ports.${direction} contains duplicate name ${JSON.stringify(id)}`);
    }
  }
  return errors;
}

function validateManifest(manifest) {
  const validator = validators[manifest.kind];
  if (!validator) {
    return [`unsupported package kind ${JSON.stringify(manifest.kind)}`];
  }
  if (!validator(manifest)) {
    return validator.errors.map(
      (error) => `${error.instancePath || "/"} ${error.message}`,
    );
  }
  return manifest.kind === "world"
    ? validateWorldSemantics(manifest)
    : validateObjectSemantics(manifest);
}

async function fixtureFiles(category) {
  const directory = path.join(fixtureDir, category);
  return (await readdir(directory))
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => path.join(directory, file));
}

let failures = 0;
for (const category of ["valid", "invalid"]) {
  for (const file of await fixtureFiles(category)) {
    const manifest = await readJson(file);
    const errors = validateManifest(manifest);
    const expectedValid = category === "valid";
    const passed = expectedValid ? errors.length === 0 : errors.length > 0;
    const label = path.relative(root, file);
    if (passed) {
      console.log(`PASS ${label}`);
      continue;
    }

    failures += 1;
    console.error(`FAIL ${label}`);
    if (expectedValid) {
      for (const error of errors) console.error(`  ${error}`);
    } else {
      console.error("  invalid fixture unexpectedly validated");
    }
  }
}

for (const category of ["bridge-valid", "bridge-invalid"]) {
  for (const file of await fixtureFiles(category)) {
    const message = await readJson(file);
    const valid = validators.bridge(message);
    const expectedValid = category === "bridge-valid";
    const passed = expectedValid ? valid : !valid;
    const label = path.relative(root, file);
    if (passed) {
      console.log(`PASS ${label}`);
      continue;
    }

    failures += 1;
    console.error(`FAIL ${label}`);
    if (expectedValid) {
      for (const error of validators.bridge.errors ?? []) {
        console.error(`  ${error.instancePath || "/"} ${error.message}`);
      }
    } else {
      console.error("  invalid bridge fixture unexpectedly validated");
    }
  }
}

for (const category of ["capability-valid", "capability-invalid"]) {
  for (const file of await fixtureFiles(category)) {
    const message = await readJson(file);
    const valid = validators.capability(message);
    const expectedValid = category === "capability-valid";
    const passed = expectedValid ? valid : !valid;
    const label = path.relative(root, file);
    if (passed) {
      console.log(`PASS ${label}`);
      continue;
    }

    failures += 1;
    console.error(`FAIL ${label}`);
    if (expectedValid) {
      for (const error of validators.capability.errors ?? []) {
        console.error(`  ${error.instancePath || "/"} ${error.message}`);
      }
    } else {
      console.error("  invalid capability fixture unexpectedly validated");
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} fixture expectation(s) failed`);
  process.exit(1);
}

console.log("\nAll experimental v0 schemas and fixtures passed.");
