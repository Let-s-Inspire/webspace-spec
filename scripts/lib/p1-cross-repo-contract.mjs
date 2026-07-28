import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const schemaId = {
  world: "https://webspacebrowser.com/schemas/experimental/v0/world.schema.json",
  object: "https://webspacebrowser.com/schemas/experimental/v0/object.schema.json",
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function applyFixture(base, fixture) {
  const value = clone(base);
  if (fixture.set) {
    const [pointer, replacement] = fixture.set;
    const parts = pointer.slice(1).split("/").map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"));
    let target = value;
    for (const part of parts.slice(0, -1)) target = target[part];
    target[parts.at(-1)] = replacement;
  }
  if (fixture.own) {
    Object.defineProperty(value, fixture.own[0], {
      value: fixture.own[1],
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return value;
}

function acceptedByBrowser(validator, manifest, kind) {
  try {
    validator(manifest, kind);
    return true;
  } catch {
    return false;
  }
}

export async function loadP1Contract({ specRoot, browserRoot }) {
  const schemaDir = path.join(specRoot, "schemas", "experimental", "v0");
  const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
  const schemas = await Promise.all(
    ["package.schema.json", "world.schema.json", "object.schema.json"].map(
      (file) => readJson(path.join(schemaDir, file)),
    ),
  );
  const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: true });
  addFormats(ajv);
  for (const schema of schemas) ajv.addSchema(schema);

  const browser = await import(
    `${pathToFileURL(path.join(browserRoot, "client/js/ContentNavigator/WebspacePackageLoader.js")).href}?p1=${Date.now()}`
  );
  const bases = {
    world: await readJson(path.join(schemaDir, "fixtures/valid/minimal-world.wsp.json")),
    object: await readJson(path.join(schemaDir, "fixtures/valid/connect-four.wso.json")),
  };
  const fixtures = await readJson(path.join(schemaDir, "fixtures/p1-cross-repo.json"));
  return {
    fixtures,
    evaluate(fixture, mutation = null) {
      const manifest = applyFixture(bases[fixture.base], fixture);
      const kind = fixture.base;
      let spec = Boolean(ajv.getSchema(schemaId[kind])(manifest));
      let browserResult = acceptedByBrowser(
        kind === "world"
          ? browser.validateExperimentalWorldManifest
          : browser.validateExperimentalObjectManifest,
        manifest,
        kind,
      );
      if (mutation?.fixture === fixture.name) {
        if (mutation.side === "spec") spec = mutation.accept;
        if (mutation.side === "browser") browserResult = mutation.accept;
      }
      return { fixture: fixture.name, expected: fixture.valid, spec, browser: browserResult };
    },
  };
}

export function assertP1Agreement(results) {
  const failures = results.filter(
    (result) =>
      result.spec !== result.browser ||
      result.spec !== result.expected,
  );
  if (failures.length) {
    throw new Error(
      failures.map((item) =>
        `${item.fixture}: expected=${item.expected} spec=${item.spec} browser=${item.browser}`
      ).join("\n"),
    );
  }
}
