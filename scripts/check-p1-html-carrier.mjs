import process from "node:process";
import { loadBrowserContainerApi } from "./lib/p1-container-contract.mjs";
import { auditCarrierSourceMutations, auditHtmlCarrier } from "./lib/p1-html-carrier.mjs";

const browserRoot = process.env.WEBSPACE_BROWSER_ROOT;
if (!browserRoot) throw new Error("WEBSPACE_BROWSER_ROOT must name a Browser checkout");
const api = await loadBrowserContainerApi(browserRoot);
const report = await auditHtmlCarrier({ api });
const mutations = await auditCarrierSourceMutations({ browserRoot });
console.log(`PASS HTML carrier positives: ${report.positives.join(", ")}`);
console.log(`PASS HTML carrier negative and pre-runtime rejection matrix`);
console.log(`PASS HTML carrier source mutations: ${mutations.join(", ")}`);
