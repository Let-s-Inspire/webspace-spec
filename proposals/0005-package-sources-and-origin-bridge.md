# 0005: Package Sources and Origin Bridge Protocol (experimental)

Status: **draft experimental protocol**. Not normative, no conformance claim.

Depends on:

- [0001: Goals, Trust Boundaries, and Threat Model](0001-goals-trust-and-threat-model.md)
- [0002: Experimental Package and Container Profile](0002-experimental-package-profile.md)
- [0003: Identity Provider Interface](0003-identity-provider-interface.md)

Feeds the runtime lifecycle proposal and the top-level package loader.

## 1. Problem

A web-hosted Webspace Browser cannot directly read arbitrary cross-origin
packages unless the publishing origin opts into CORS. The Browser's CSP may
restrict connections or frames, and the publishing origin may prohibit
framing.

Requiring every creator to configure HTTP headers conflicts with the goal that
a static upload can publish a Webspace. A server-side relay works, but creates
infrastructure, privacy, availability, and intermediary-trust costs.

Private worlds add another requirement: a publishing origin may legitimately
require authentication before returning its package or assets.

This proposal defines:

1. a transport-independent package-source interface;
2. deterministic direct, origin-bridge, relay, local, and abort behavior;
3. an automatically discoverable same-origin helper document;
4. an authenticated origin-bridge mode tied to the identity broker;
5. an optional single-HTML-file carrier containing one opaque package bundle.

The mechanism is called an **origin bridge**. It does not disable or bypass
CSP, CORS, or the same-origin policy. The publishing origin deliberately
exports selected package bytes across a narrow message boundary.

## 2. Responsibility Boundaries

The following responsibilities do not overlap:

| Layer | Responsibility |
| --- | --- |
| Manifest | Defines package identity, entry modules, assets, integrity, capabilities, and policy |
| `.wsp` / `.wso` bundle | Stores one manifest and its `package:/` resources |
| HTML carrier | Stores one opaque bundle and runs a pinned origin bridge |
| Package source | Acquires bundle, manifest, and resource bytes |
| Browser loader | Parses containers, validates manifests, verifies integrity, and negotiates compatibility |
| Runtime lifecycle | Starts, enters, pauses, resumes, unloads, and cleans up validated packages |

Scripts are declared exactly once, in the manifest. A bridge or HTML carrier
must not create a second list of entry scripts or assets.

## 3. Goals

- Allow a creator with static HTTPS hosting to publish without configuring
  CORS headers.
- Keep package semantics independent of transport and physical representation.
- Use the same validation and integrity path for direct, bridged, relayed, and
  local packages.
- Make one URL sufficient to discover and load a package.
- Keep the bridge read-only, package-bound, and unsuitable as a general web
  proxy.
- Support public packages and explicitly authenticated private packages.
- Keep identity credentials scoped to the exact publishing origin and package.
- Never expose private-package credentials to an untrusted third-party relay
  in experimental v0.
- Bound memory, bandwidth, requests, response size, and lifetime.
- Make relay use visible to visitors and portals.
- Permit a future native Browser to omit web transports without changing
  package or lifecycle semantics.

## 4. Non-goals

- Circumventing `frame-ancestors`, `X-Frame-Options`, mixed-content, or an
  explicit publisher rejection.
- Executing package code in the bridge iframe.
- Supporting arbitrary HTTP methods, headers, request bodies, or URLs.
- Making a bridge or relay response trusted.
- Defining lifecycle callbacks or capability semantics.
- Sending general Browser cookies or identity credentials to arbitrary worlds.
- Relaying authenticated private packages through an untrusted intermediary.
- Guaranteeing support on every static host.

## 5. Terminology

**Package source**
: A bounded interface that supplies a package descriptor and either a complete
  bundle or a loose manifest plus declared resources.

**Direct source**
: Reads package bytes with ordinary `fetch()` and CORS.

**Origin bridge**
: A helper document hosted on the package origin and embedded cross-origin by
  the Browser.

**Bridge source**
: A package source backed by an origin bridge session.

**Relay source**
: A package source backed by a server that retrieves public package bytes for
  the Browser.

**Local source**
: A package source backed by local files, drag-and-drop, or development tools.

**HTML carrier**
: A bridge document containing one inert base64-encoded `.wsp` or `.wso`
  bundle.

**Package root**
: The same-origin URL directory from which a loose bridge may read one
  manifest and its declared package resources.

## 6. Package Source Interface

The conceptual interface is:

```ts
type PackageSourceDescriptor = {
  transport: "direct" | "origin-bridge" | "relay" | "local";
  representation: "bundle" | "loose";
  sourceUrl: string;
  sourceOrigin: string | null;
  authenticated: boolean;
  intermediary: string | null;
};

type PackageBytes = {
  url: string;
  mediaType: string;
  bytes: ArrayBuffer;
};

interface PackageSource {
  describe(signal?: AbortSignal): Promise<PackageSourceDescriptor>;
  readBundle?(signal?: AbortSignal): Promise<PackageBytes>;
  readManifest?(signal?: AbortSignal): Promise<PackageBytes>;
  readResource?(
    reference: `package:/${string}`,
    signal?: AbortSignal,
  ): Promise<PackageBytes>;
  authenticate?(
    credential: PackageCredential,
    signal?: AbortSignal,
  ): Promise<void>;
  close(reason?: string): Promise<void>;
}
```

This is an architectural interface, not a required JavaScript API.

A bundled source supplies the complete `.wsp` or `.wso`. A loose source
supplies a `.wsp.json` or `.wso.json` manifest and resolves declared
`package:/` resources. Both become the same logical package before lifecycle
begins.

All source implementations feed this downstream process:

1. acquire bundle or manifest bytes;
2. enforce byte and time limits;
3. decode the container if present;
4. parse the manifest without executing it;
5. validate against the P1 schema;
6. resolve only manifest-declared resources;
7. verify package and resource integrity;
8. negotiate compatibility and requested capabilities;
9. pass executable bytes to the isolated runtime;
10. close the source when no longer needed.

A transport never grants capabilities or makes a package trusted.

## 7. Source Selection State Machine

Given an explicitly selected HTTPS package or carrier URL:

```text
DIRECT
  ├─ success ──────────────────────────────> VALIDATE
  ├─ authentication-required ──────────────> AUTHENTICATE, retry DIRECT
  └─ transport-unavailable ────────────────> BRIDGE DISCOVERY

BRIDGE
  ├─ success ──────────────────────────────> VALIDATE
  ├─ authentication-required ──────────────> AUTHENTICATE, retry BRIDGE
  └─ transport-unavailable ────────────────> RELAY, public only

RELAY
  ├─ success ──────────────────────────────> VALIDATE with relay indicator
  └─ unavailable ──────────────────────────> ABORT

VALIDATE
  ├─ success ──────────────────────────────> P2 LIFECYCLE
  └─ any content/security failure ─────────> ABORT
```

Fallback is allowed only for transport availability:

- CORS prevents reading a response;
- connection or DNS failure;
- framing denied;
- helper not found;
- bridge handshake timeout;
- unsupported bridge protocol;
- configured relay unavailable.

Fallback is forbidden after:

- malformed or invalid manifest/container;
- package ID, kind, version, or canonical-origin mismatch;
- integrity or signature failure;
- unsupported required feature or capability;
- unauthorized resource;
- explicit authentication denial;
- source limit exceeded after bytes are obtained;
- malicious or malformed bridge protocol behavior.

This prevents induced failures from downgrading a package to a weaker source.

Source fallback must not change package identity. Manifest identity, publisher
evidence, canonical URL, expected package or manifest integrity, and verified
bytes control grant lookup.

## 8. Bridge Discovery

For package URL:

```text
https://world.example/worlds/plaza.wsp
```

the Browser checks bridge candidates in this order:

1. an explicit `bridgeUrl` supplied by a trusted portal/address descriptor;
2. the package URL itself when it is an HTML carrier;
3. sibling `https://world.example/worlds/webspacebridge.html`;
4. origin root `https://world.example/webspacebridge.html`;
5. `https://world.example/.well-known/webspace-bridge`.

Candidates must have the exact package origin. Redirects to another origin are
not bridge discovery.

The sibling helper is preferred because its natural package root is narrow. A
root helper can potentially reach more public origin resources and must apply
explicit configured roots.

The Browser may cache a successful bridge location with a short expiry, but
must tolerate removal, replacement, or changed policy.

## 9. Iframe Creation

The Browser creates a hidden iframe:

```html
<iframe
  hidden
  sandbox="allow-scripts allow-same-origin"
  referrerpolicy="no-referrer"
></iframe>
```

`allow-scripts` runs the bridge. `allow-same-origin` lets it read from its own
origin. Cross-origin same-origin policy still isolates the frame from the
Browser parent.

The Browser does not grant forms, popups, downloads, pointer lock,
presentation, top navigation, modals, or storage access by default.

The Browser's CSP must permit intended bridge origins in `frame-src`.
Publisher `frame-ancestors` and `X-Frame-Options` remain controlling.

## 10. Connection Handshake

The parent initiates every session:

1. record the exact expected bridge origin and source window;
2. generate at least 128 bits of unpredictable nonce data;
3. create a `MessageChannel`;
4. wait for iframe `load`;
5. post `webspace.bridge.connect` with exact `targetOrigin` and transfer one
   port;
6. use only the retained port after connection.

```js
iframe.contentWindow.postMessage(
  {
    protocol: "https://webspacebrowser.com/protocols/origin-bridge/experimental-v0",
    type: "webspace.bridge.connect",
    nonce,
    package: "./plaza.wsp",
    authentication: {
      mode: "public"
    },
    limits: {
      manifestBytes: 1048576,
      resourceBytes: 67108864,
      packageBytes: 268435456,
      requests: 4096,
      idleMilliseconds: 30000
    }
  },
  expectedOrigin,
  [channel.port2],
);
```

`package` is the original package URL expressed as a same-origin relative
reference from the bridge. An HTML carrier uses `"package": "embedded"`.

The bridge accepts only when:

- protocol, package reference, authentication descriptor, and limits validate;
- exactly one port is transferred;
- no parent session is already live;
- `event.origin` is permitted by local publisher policy;
- the requested package remains within a configured package root.

It responds through the transferred port:

```js
{
  protocol,
  type: "webspace.bridge.connected",
  nonce,
  bridgeVersion: "0.1.0",
  operations: ["describe", "bundle", "manifest", "read", "close"]
}
```

The Browser rejects wrong origin, source window, nonce, protocol, port count,
duplicate connection, late response, or malformed message.

The nonce binds the initial exchange. The transferred port is the capability
for later messages.

## 11. Port Protocol

Every request contains the protocol identifier and a unique request ID of at
most 128 printable ASCII characters. Responses echo the request ID, may arrive
out of order, and have `ok: true` or `ok: false`.

Operations:

- `webspace.bridge.describe`
- `webspace.bridge.bundle`
- `webspace.bridge.manifest`
- `webspace.bridge.read`
- `webspace.bridge.authenticate`
- `webspace.bridge.close`

### Describe

```js
{
  protocol,
  type: "webspace.bridge.result",
  requestId: "1",
  ok: true,
  result: {
    kind: "world",
    representation: "bundle",
    packageMediaType: "application/webspace-world",
    packageRoot: "https://world.example/worlds/",
    authenticated: false
  }
}
```

Describe is advisory. Validated package bytes determine authoritative kind and
identity.

### Bundle

`webspace.bridge.bundle` returns the complete `.wsp` or `.wso` as a transferred
`ArrayBuffer`.

### Manifest

`webspace.bridge.manifest` is available for loose packages and returns the
`.wsp.json` or `.wso.json` manifest.

### Read

```js
{
  protocol,
  type: "webspace.bridge.read",
  requestId: "3",
  reference: "package:/resources/world.js"
}
```

Read is valid only for loose packages and only for a resource declared by the
validated manifest.

### Bytes response

```js
{
  protocol,
  type: "webspace.bridge.bytes",
  requestId: "3",
  ok: true,
  url: "package:/resources/world.js",
  mediaType: "text/javascript",
  byteLength: 1024,
  body: arrayBuffer
}
```

`body` is an `ArrayBuffer` in the transfer list. Experimental v0 transfers
whole resources and bundles.

### Close

Either side may close. The receiver acknowledges, aborts pending work,
releases retained buffers and ports, and performs no later reads. The Browser
removes the iframe.

## 12. Authentication

Source authentication has three modes.

### Public

```json
{ "mode": "public" }
```

Resource reads use `credentials: "omit"`. This is the default.

### Origin session

```json
{ "mode": "origin-session" }
```

The bridge uses a session belonging to its own exact origin and fetches with
`credentials: "same-origin"`. Browser privacy controls, storage partitioning,
and third-party-cookie restrictions may prevent this. A top-level login or
user-mediated storage-access step may be necessary.

Origin-session mode is permitted only after the Browser discloses the exact
origin and receives user approval or applicable remembered policy.

### Brokered token

```json
{
  "mode": "brokered-token",
  "audience": "https://world.example",
  "token": "short-lived-token"
}
```

The Browser identity broker obtains the token under proposal 0003. It must be:

- short-lived;
- audience-bound to the exact package origin;
- scoped to the package ID or expected package identity;
- scoped to package-read operations;
- unusable as a general Webspace identity or authority credential.

The bridge sends it only to same-origin package endpoints. Cross-origin
redirects and credential forwarding are forbidden.

### Authentication challenge

A source may respond:

```js
{
  protocol,
  type: "webspace.bridge.result",
  requestId: "1",
  ok: false,
  error: {
    code: "authentication-required",
    message: "This package requires member access.",
    retryable: true,
    challenge: {
      package: "com.example.private-world",
      origin: "https://world.example",
      provider: "https://identity.example",
      scopes: ["package.read"]
    }
  }
}
```

The Browser verifies that challenge origin equals the source origin, asks for
user consent, obtains a credential through the broker, sends
`webspace.bridge.authenticate`, and retries the failed operation.

A direct source may expose the same challenge in a readable HTTPS `401`
response using provisional media type
`application/webspace-authentication-required+json`. That response must opt
into CORS for the Browser origin. When CORS prevents reading the challenge, the
failure remains transport-unavailable and bridge discovery may proceed.
Trusted portal/address metadata may also advertise the expected provider and
scopes, but the source challenge remains authoritative and must match the
exact package origin.

World scripts never receive package-download credentials.

## 13. Resource Resolution

The bridge is package-bound, not a general proxy.

For a bundle, it returns only the selected same-origin bundle or its embedded
carrier bundle.

For a loose package, before serving a resource it must:

1. obtain and parse the manifest without executing package code;
2. confirm the exact `package:/` reference is declared;
3. map it to one normalized path under the package root;
4. reject credentials, fragments, query strings, control characters,
   malformed encoding, empty segments, and `.` or `..` traversal;
5. require the final network URL origin to equal the bridge origin;
6. reject redirects leaving the origin or package root;
7. use the selected authentication mode and bounded timeout;
8. enforce per-resource and cumulative limits.

The Browser independently validates the manifest, container, paths, and
integrity. Bridge filtering is defense in depth.

## 14. Server Relay

The relay fallback is available for public packages only in experimental v0.
The Browser must not send to a third-party relay:

- origin-session cookies;
- brokered identity tokens;
- private URLs containing credentials;
- private-network or loopback destinations;
- non-HTTPS destinations.

The relay is read-only, SSRF-hardened, size- and time-limited, and restricted
to package acquisition. It cannot grant capabilities or authenticate users.

Relay use is visible because the intermediary can observe package requests,
withhold content, return stale data, or modify unpinned bytes.

## 15. Portal and Source Trust Indicators

A portal may declare:

```json
{
  "url": "https://world.example/plaza.wsp",
  "bridgeUrl": "https://world.example/webspacebridge.html",
  "package": "com.example.plaza",
  "version": "1.2.0",
  "integrity": "sha256-..."
}
```

The Browser displays the source actually selected, not merely the portal's
preference.

Integrity is independently pinned only when the expected digest comes from a
trusted referring world/portal, verified publisher metadata, a user bookmark,
or another source outside the destination bytes being checked. A digest
declared only by the destination's own unverified manifest cannot remove the
relay warning because a relay could replace both.

Recommended indicators:

| Selected source | Indicator |
| --- | --- |
| Direct | No warning or subtle direct indicator |
| Publisher origin bridge | No warning or neutral hosted-bridge indicator |
| Relay with independently pinned package integrity | Relay/privacy indicator |
| Relay without independently pinned manifest or bundle integrity | Warning triangle |
| Unavailable | Broken/unavailable indicator |

The warning explains that an intermediary is supplying unverified package
bytes and identifies the relay operator.

A pinned bundle hash or verified publisher signature prevents undetected
modification but does not prevent relay observation, refusal, delay, or stale
delivery. Resource hashes inside an unpinned manifest do not protect against a
relay replacing both manifest and resources.

## 16. One-File HTML Carrier

A one-file Webspace is a bridge document containing exactly one opaque
base64-encoded `.wsp` or `.wso` bundle:

```html
<!doctype html>
<meta charset="utf-8">
<title>Example Webspace carrier</title>

<script
  id="webspace-package"
  type="application/webspace-package"
  data-kind="world"
  data-encoding="base64"
>
UEsDBBQAAAAI...base64 bundle bytes...==
</script>

<script>
  /* Pinned experimental-v0 origin bridge implementation. */
</script>
```

Rules:

- The package element uses an inert non-JavaScript MIME type.
- It contains one complete bundle, not separate manifest and script
  declarations.
- Base64 avoids HTML parser termination and byte transformation.
- Decoded bundle and expanded-container limits apply.
- Duplicate package elements, invalid encoding, or a JavaScript MIME type
  reject the carrier.
- The bridge never evaluates package bytes.
- The Browser parses the bundle and validates its manifest normally.

A future `webspace pack --html` command should generate the carrier.

## 17. Bridge Distribution

An automatically updating remote helper script executes with the publisher
origin's authority. Recommended distribution:

1. small auditable versioned implementation;
2. immutable release artifacts;
3. generator that copies or inlines the pinned bridge;
4. optional remote loading only with fixed SRI and
   `crossorigin="anonymous"`;
5. no auto-update inside an existing carrier or helper.

The general uploadable helper is conventionally named:

```text
webspacebridge.html
```

One helper may serve several packages only within explicitly configured roots.

## 18. Limits

Recommended experimental defaults:

| Limit | Default |
| --- | ---: |
| Handshake timeout | 10 seconds |
| Manifest bytes | 1 MiB |
| One loose resource | 64 MiB |
| Bundle or expanded package | 256 MiB |
| Requests | 4096 |
| Concurrent loose reads | 6 |
| Idle timeout | 30 seconds |
| Total session | 5 minutes |

The Browser supplies effective limits. A bridge may enforce stricter but not
looser limits. Development overrides remain finite.

## 19. Execution and CSP Boundary

The bridge supplies bytes and never executes package modules. The Browser:

- decodes the container;
- validates the manifest;
- checks required features;
- verifies integrity;
- constructs the isolated runtime;
- mediates capabilities;
- owns lifecycle and teardown.

Loading an external classic script into the Browser page is forbidden as a
transport because it executes with Browser-page authority. Module scripts do
not remove the cross-origin and isolation requirements.

The hosted Browser CSP deliberately permits intended HTTPS bridge origins in
`frame-src`, direct and relay endpoints in `connect-src`, and only required
runtime sources elsewhere. Frames remain hidden, sandboxed, bounded,
short-lived, and tied to an explicit load.

## 20. Error Model and Cleanup

Initial transport errors:

- `source-unreachable`
- `source-cors-denied`
- `source-framing-denied`
- `source-helper-not-found`
- `source-handshake-timeout`
- `source-protocol-unsupported`
- `source-authentication-required`
- `source-authentication-denied`
- `source-invalid-message`
- `source-limit-exceeded`
- `source-resource-denied`
- `source-relay-disabled`
- `source-closed`

Protocol error codes include:

- `invalid-request`
- `unsupported-protocol`
- `unsupported-operation`
- `not-connected`
- `authentication-required`
- `authentication-denied`
- `manifest-not-found`
- `bundle-not-found`
- `resource-not-declared`
- `resource-not-found`
- `resource-too-large`
- `package-limit-exceeded`
- `request-limit-exceeded`
- `timeout`
- `redirect-denied`
- `origin-denied`
- `read-failed`
- `closed`
- `internal-error`

Messages must not expose credentials, cookies, private response headers,
filesystem paths, or stack traces.

Failure, cancellation, unload, replacement, or navigation closes the source,
aborts pending requests, removes the iframe, releases ports, and releases
transferred buffers.

## 21. Security Analysis

### Malicious bridge

It can lie, stall, fingerprint, or return hostile bytes. Exact-origin and
source-window checks, nonce and port binding, strict messages, finite limits,
container validation, integrity, and runtime isolation bound the damage.

### Confused deputy

A general URL fetcher would expose same-origin authority. Package-root
restriction, declaration checks, selected credential mode, same-origin
redirects, and read-only operations prevent that design.

### Authentication leakage

Audience, origin, package, scope, and lifetime restrictions limit brokered
tokens. Relay fallback is disabled for authenticated packages.

### Relay manipulation

Pinned bundle integrity or publisher signatures detect changed bytes.
Unpinned relayed packages receive a visible warning.

### Supply chain

Pinned immutable bridge releases reduce helper compromise risk. Package bytes
remain untrusted regardless.

### Resource exhaustion

Handshake, idle, session, request, concurrency, compressed, expanded, and byte
limits bound work.

## 22. Conformance Scenarios

Successful paths:

- direct loose package;
- direct bundled package;
- automatically discovered sibling helper;
- explicit helper;
- general root helper with an allowed package root;
- one-file HTML carrier;
- public relay fallback;
- origin-session authentication;
- brokered-token authentication;
- `.wso` through each applicable source;
- close and cleanup.

Rejection and non-downgrade paths:

- wrong origin, source window, nonce, protocol, or port count;
- duplicate live connection;
- package outside helper root;
- undeclared `package:/` resource;
- path traversal or cross-origin redirect;
- invalid container or manifest;
- integrity mismatch without fallback;
- explicit authentication denial without relay fallback;
- broker token with wrong origin, audience, package, scope, or expiry;
- relay attempt for private package;
- all finite limits;
- malformed or duplicate HTML carrier package;
- messages after close;
- publisher framing denial.

Tests distinguish transport, authentication, container, schema, compatibility,
integrity, capability, and lifecycle failures.

## 23. Relationship to Other Proposals

### P1 package profile

P1 defines the logical package, loose manifest, bundle, and `package:/`
namespace. This proposal only acquires those bytes.

### Identity

Proposal 0003 brokers origin- and package-scoped credentials. World code never
receives package-download credentials.

### P2 lifecycle

P2 begins after source acquisition, container decoding, manifest validation,
integrity, and compatibility checks. P2 cleanup always closes the source.

### Embedding and navigation

The hidden bridge is not the visible Webspace embed from proposal 0004. It
does not render the destination or own navigation identity.

### Native Browser

A native implementation may use direct and local sources and omit the iframe
bridge without changing packages or lifecycle.

## 24. Deferred Work

- Streaming and range reads.
- Stable archive format decision.
- Publisher signatures and verified package identities.
- Standard relay API, operation, and privacy policy.
- Sender-constrained relay credentials or end-to-end encrypted private
  packages.
- Offline caches and service workers.
- Registered media types.
- Stable protocol governance.

## 25. Acceptance Criteria

Proposal 0005 is ready for implementation testing when:

- manifests, bundles, HTML carriers, sources, loaders, and lifecycle have
  non-overlapping responsibilities;
- direct, bridge, relay, and local sources share one boundary;
- source selection permits only transport fallback, never security downgrade;
- sibling `webspacebridge.html` discovery is deterministic;
- exact origin, nonce, port, package root, timeout, and close rules exist;
- public, origin-session, and brokered-token modes are explicit;
- authenticated packages never silently use an untrusted relay;
- relay use and unpinned intermediary risk are visible;
- one-file HTML carries one opaque ordinary `.wsp` or `.wso`;
- finite limits and cleanup are explicit;
- a native Browser can omit the bridge without changing package semantics.
