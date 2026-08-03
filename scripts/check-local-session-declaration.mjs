import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFile(path.join(root, file), "utf8");
export const requiredProposalAnchors = [
  '"session": {', '"mode": "local"', "optional for backward compatibility",
  "Multiplayer/session networking", "Integrity-checked acquisition",
  "Browser-owned identity-provider traffic", "Trusted host services",
  "Arbitrary package-originated network access", "most restrictive intersection",
  "Neither a host nor package code may weaken", "fail closed",
  "MUST NOT silently fall back to networked execution",
];
export function declarationDocumentErrors(text) {
  return requiredProposalAnchors.filter((anchor) => !text.includes(anchor))
    .map((anchor) => `proposal missing ${JSON.stringify(anchor)}`);
}
export async function checkLocalSessionDeclaration() {
  const errors = declarationDocumentErrors(await read("proposals/0008-local-session-declaration.md"));
  const schema = JSON.parse(await read("schemas/experimental/v0/world.schema.json"));
  const session = schema.properties.session;
  if (session?.additionalProperties !== false || session?.properties?.mode?.const !== "local") {
    errors.push("world schema must contain a closed session.mode local declaration");
  }
  for (const fixture of ["valid/local-session-world.wsp.json", "invalid/world-session-unknown-mode.json", "invalid/world-session-malformed.json", "invalid/world-session-unknown-field.json", "invalid/world-session-authority-conflict.json"]) {
    try { await read(`schemas/experimental/v0/fixtures/${fixture}`); }
    catch { errors.push(`missing fixture ${fixture}`); }
  }
  if (errors.length) throw new Error(errors.join("\n"));
  return "local-session declaration contract valid";
}
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(await checkLocalSessionDeclaration());
