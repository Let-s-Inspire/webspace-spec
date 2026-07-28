import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertP1BDocumentationPolicy } from "./lib/p1b-documentation-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const proposal = await readFile(
  path.join(root, "proposals/0005-package-sources-and-origin-bridge.md"),
  "utf8",
);
assertP1BDocumentationPolicy(proposal);
console.log("PASS proposal 0005 explicit-relay documentation policy");

