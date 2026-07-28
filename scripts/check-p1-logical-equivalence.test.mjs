import test from "node:test";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { loadBrowserContainerApi } from "./lib/p1-container-contract.mjs";
import { auditLogicalEquivalence, auditResolutionDriftMutation } from "./lib/p1-logical-equivalence.mjs";

const specRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("loose and bundle packages preserve logical identity and separated integrity", async () => {
  const browserRoot = process.env.WEBSPACE_BROWSER_ROOT;
  const schemaDir = path.join(specRoot, "schemas/experimental/v0");
  const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: true });
  addFormats(ajv);
  for (const name of ["package.schema.json", "world.schema.json", "object.schema.json"]) {
    ajv.addSchema(JSON.parse(await readFile(path.join(schemaDir, name), "utf8")));
  }
  const validateSpec = (value, kind) => Boolean(ajv.getSchema(
    `https://webspacebrowser.com/schemas/experimental/v0/${kind}.schema.json`,
  )(value));
  const api = await loadBrowserContainerApi(browserRoot);
  await auditLogicalEquivalence({ api, validateSpec });
  await auditResolutionDriftMutation({ api });
});
