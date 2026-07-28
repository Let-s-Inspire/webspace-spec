import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFile } from "node:fs/promises";
import { auditContainers } from "./lib/p1-container-contract.mjs";

const specRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const browserRoot = process.env.WEBSPACE_BROWSER_ROOT;
if (!browserRoot) throw new Error("WEBSPACE_BROWSER_ROOT must name a canonical Browser checkout");
const schemaDir = path.join(specRoot, "schemas/experimental/v0");
const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: true });
addFormats(ajv);
for (const file of ["package.schema.json", "world.schema.json", "object.schema.json"]) {
  ajv.addSchema(JSON.parse(await readFile(path.join(schemaDir, file), "utf8")));
}
const validateSpec = (manifest, kind) => Boolean(ajv.getSchema(
  `https://webspacebrowser.com/schemas/experimental/v0/${kind}.schema.json`,
)(manifest));
const report = await auditContainers({ browserRoot, validateSpec });
console.log(`PASS positive bundles: ${report.positives.join(", ")}`);
console.log(`PASS pre-execution rejection: ${report.negatives.join(", ")}`);
console.log(`PASS bound-removal mutations: ${report.mutations.join(", ")}`);
