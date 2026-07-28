import test from "node:test";
import process from "node:process";
import { loadBrowserContainerApi } from "./lib/p1-container-contract.mjs";
import { auditCarrierSourceMutations, auditHtmlCarrier } from "./lib/p1-html-carrier.mjs";

test("optional HTML carrier remains an opaque, bounded, non-executable bundle transport", async () => {
  const browserRoot = process.env.WEBSPACE_BROWSER_ROOT;
  const api = await loadBrowserContainerApi(browserRoot);
  await auditHtmlCarrier({ api });
  await auditCarrierSourceMutations({ browserRoot });
});
