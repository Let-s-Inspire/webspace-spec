import { execFile } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const browserRoot = process.env.WEBSPACE_BROWSER_ROOT;
if (!browserRoot) throw new Error("WEBSPACE_BROWSER_ROOT must name a Browser checkout");
const testFile = path.join(
  browserRoot,
  "client/js/ContentNavigator/WebspacePackageLoader.carrier-connector.test.mjs",
);
const { stdout, stderr } = await promisify(execFile)(
  process.execPath,
  ["--test", testFile],
  { maxBuffer: 1024 * 1024 },
);
process.stdout.write(stdout);
process.stderr.write(stderr);
console.log("PASS Spec-owned invocation of Browser production carrier connector");
