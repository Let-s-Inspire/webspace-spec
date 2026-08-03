# 0002: Experimental Package and Container Profile

Status: **draft experimental profile**. This proposal is not a stable
specification and makes no conformance claim.

Depends on
[0001: Goals, Trust Boundaries, and Threat Model](0001-goals-trust-and-threat-model.md).

## 1. Purpose

This proposal defines the first machine-readable logical package profile and
portable container needed to load a Webspace world or reusable object without
relying on implementation defaults.

It deliberately standardizes less than a complete world format. The profile
provides a versioned envelope and typed declarations that later proposals can
refine using implementation experience.

The corresponding JSON Schemas are:

- `schemas/experimental/v0/package.schema.json`
- `schemas/experimental/v0/world.schema.json`
- `schemas/experimental/v0/object.schema.json`

## 2. Logical Packages, Manifests, and Containers

The profile has two logical package roles:

- a world package with `kind: "world"`;
- a reusable object package with `kind: "object"`.

Each logical package consists of exactly one manifest and a package-relative
resource namespace. The manifest is the sole authority for package identity,
entry modules, assets, dependencies, integrity, compatibility, requested
capabilities, and role-specific declarations.

The logical package has several physical representations:

| Representation | World | Object | Responsibility |
| --- | --- | --- | --- |
| Loose manifest | `.wsp.json` | `.wso.json` | UTF-8 JSON manifest used with a package resource directory |
| Bundle | `.wsp` | `.wso` | Portable container holding `manifest.json` and package resources |
| HTML carrier | `.html` | `.html` | Optional deployment artifact carrying one opaque bundle and an origin bridge |

The `kind` field remains authoritative after parsing. A Browser must not infer
privileges from an extension, MIME type, filename, container, or embedding
location.

Transport-independent direct, bridge, relay, local, and HTML-carrier loading
are defined by proposal 0005. Those transports supply package bytes; they do
not redefine package contents.

## 3. Profile and Versioning

Every manifest declares:

```json
{
  "$schema": "https://webspacebrowser.com/schemas/experimental/v0/world.schema.json",
  "profile": "https://webspacebrowser.com/profiles/package/experimental-v0",
  "kind": "world",
  "id": "com.example.plaza",
  "version": "0.1.0"
}
```

`profile` identifies runtime semantics. `$schema` is an authoring and
validation hint and does not select runtime behavior.

Package `version` uses Semantic Versioning. It versions the published package,
not this profile. A changed executable or asset resource should result in a
new immutable package version.

Experimental profile changes that are not backward compatible must use a new
profile identifier and schema path. Fields must not silently change meaning.

## 4. Package Identity and Origin

`id` is a stable publisher-controlled identifier using reverse-domain form.
The experimental profile validates syntax but does not prove domain ownership.
Publisher verification and delegated ownership remain future work.

`canonicalUrl`, when present, identifies the preferred public, shareable
Webspace destination. It is the URL used for top-level navigation and honest
address-bar/history behavior under proposal 0004. It should normally be an
HTML page capable of loading the Webspace directly, not a raw manifest or
bundle URL.

The URL from which package bytes were acquired is runtime source metadata and
is distinct from `canonicalUrl`. It may identify a loose manifest, bundle, or
HTML carrier. Neither URL grants trust, and neither is the base URL for
internal resources.

A Browser should key remembered grants by at least package ID, publisher or
origin evidence, and capability scope. An ID string alone is insufficient.

## 5. Resources and Integrity

Executable modules are declared under `entry` and optional `modules`. Assets
are declared under `assets`. The manifest declares each script and asset
exactly once, regardless of physical representation.

Every executable resource requires an `integrity` value. The initial syntax is
Subresource Integrity `sha256`, `sha384`, or `sha512`. Cross-origin executable
loading remains subject to Browser policy and the web security model.

Asset integrity is optional in this experimental profile because some current
worlds use dynamically generated or mutable media. Browsers should warn about
mutable assets, and release packages should provide integrity wherever
possible.

Packaged resources use canonical `package:/` URLs:

```json
{
  "entry": {
    "module": "package:/resources/world.js",
    "integrity": "sha256-..."
  }
}
```

`package:/` identifies the current logical package, not a network origin. It
has one leading slash, normalized UTF-8 path segments, no authority,
credentials, query, fragment, empty segment, `.` segment, or `..` segment.

For a loose manifest, the manifest's containing URL directory is the package
root: `package:/resources/world.js` in
`https://example.com/plaza/world.wsp.json` maps to
`https://example.com/plaza/resources/world.js`. For a bundle, the same package
URL maps to archive entry `resources/world.js`. This mapping is deterministic
and independent of `canonicalUrl`.

Relative imports inside a packaged ES module resolve against its `package:/`
module URL. For example, `./physics.js` imported by
`package:/resources/world.js` resolves to
`package:/resources/physics.js`.

Entry and additional executable modules must use `package:/` in experimental
v0. Assets may use `package:/` or an absolute HTTPS URL. External assets remain
subject to Browser policy and must provide integrity in immutable releases.

Resource IDs are package-local. Network URLs must not contain credentials.

## 6. Bundle Container

The experimental `.wsp` and `.wso` containers are ZIP-compatible archives
with this layout:

```text
manifest.json
resources/
  world.js
  physics.js
  plaza.glb
  logo.png
```

Container rules:

- `manifest.json` is present exactly once at the archive root.
- The manifest `kind` agrees with the expected package role.
- `package:/resources/x` maps to the normalized archive entry
  `resources/x`.
- Entry names are UTF-8, relative, slash-separated, and unique after Unicode
  and percent-decoding normalization.
- Absolute paths, backslashes, drive prefixes, NULs, `.` and `..` segments,
  symlinks, hard links, devices, and encrypted entries are rejected.
- Experimental v0 permits stored and DEFLATE-compressed regular files.
- CRC checks do not replace manifest integrity verification.
- Compressed size, expanded size, entry count, compression ratio, nesting, and
  extraction time are bounded before or during decoding.
- Implementations read entries without extracting attacker-selected paths onto
  a filesystem.

An integrity value attached to a portal or address may pin the entire bundle.
Manifest resource integrity independently protects individual package bytes.

## 7. Entry and Lifecycle

`entry.module` identifies the primary ES module. `entry.export` defaults
conceptually to `default`; the schema does not inject that value.

`entry.lifecycle` names exported lifecycle callbacks:

- `load`
- `ready`
- `enter`
- `pause`
- `resume`
- `unload`

This proposal records names only. Invocation order, arguments, cancellation,
and teardown guarantees belong to the lifecycle proposal.

Additional modules may declare a `phase` of `preload`, `load`, or `lazy`.
Declaring a module does not bypass execution isolation or capability checks.

## 8. Compatibility

`compatibility.requires` lists named features the package cannot function
without. `compatibility.optional` lists features that improve the experience.

Feature names are lower-case dotted identifiers. Names beginning with
`webspace.` are reserved for future standardized features. Other feature names
must use a reverse-domain prefix controlled by their publisher.

Unsupported required features reject the package before execution. Unsupported
optional features are exposed through negotiation and must not cause implicit
privilege escalation.

### 8.1 Local session declaration

A world may require non-networked multiplayer-session execution with the closed
declaration `session: { "mode": "local" }`. Its normative semantics, authority
composition, network-category separation, compatibility behavior, and conflict
rules are defined by [0008](0008-local-session-declaration.md).

## 9. Capability Requests

`capabilities` contains requests, never grants. Each request declares:

- `name`: a lower-case dotted capability identifier;
- `required`: whether denial prevents startup;
- `reason`: user-facing justification;
- `scope`: capability-specific bounds;
- `durationSeconds` (optional): the requested grant duration.

Behavior on optional-capability denial is the package-level `failure.optionalCapabilityDenied`
policy (`degrade` or `reject`), not a per-capability field, so exactly one control governs it.

This is the single canonical capability request shape. Other proposals (for example the runtime
capability negotiation in 0006) reference it rather than defining their own.

Capability names beginning with `webspace.` are reserved. Examples include:

- `webspace.user.pose-control`
- `webspace.input.pointer-lock`
- `webspace.input.keyboard-lock`
- `webspace.network.fetch`
- `webspace.identity.claims`
- `webspace.media.microphone`
- `webspace.storage.persistent`
- `webspace.navigation.external`
- `webspace.portal.publish`

This profile does not define those capabilities' complete semantics. A Browser
must reject an unknown required capability and deny or ignore an unknown
optional capability.

The effective-power intersection from proposal 0001 remains controlling.

## 10. Identity Requests

The optional `identity.requests` array declares identity levels that world
code may request through the broker defined by proposal 0003. Each declaration
contains:

- `level`: `anonymous`, `world-pseudonym`, `global`, or
  `external:<provider-name>`;
- `reason`: a user-facing explanation;
- optional `claims`: provider-specific claims the world may request;
- optional `providerHint`: discovery metadata for an external provider.

A provider hint does not select a provider, grant identity, or let world code
contact that provider. The Browser remains the broker and may ignore a hint.
The granted level may be weaker than the requested level, down to
`anonymous`, and worlds must handle that result.
Manifest validation never grants a capability.

## 10. Dependencies

`dependencies` identifies other packages by ID, version range, package entry
URL, and integrity. The URL may resolve to a loose manifest, bundle, or HTML
carrier. A dependency retains its own package identity and capability
boundary.

Dependency version ranges use a deliberately small syntax in v0: exact
versions and the `^`, `~`, `>=`, `>`, `<=`, or `<` comparators. Resolution,
lock files, graph cycles, duplicate versions, and transitive consent require a
future dependency proposal.

Browsers must not merge a dependency's capability requests into its parent.

## 11. Privacy and Resource Requests

`privacy.data` declares categories of data the package expects to process.
`privacy.purposes` provides short user-facing reasons. This declaration is
inspectable metadata, not consent or permission.

`resources` contains requested ceilings for memory, workers, network
concurrency, storage, and frame time. Browsers may provide less, reject the
package, or terminate it for exceeding effective limits. Requested values are
not reservations or grants.

## 12. World Profile

A world manifest requires:

- one or more `entrances`;
- one `defaultEntrance` referencing an entrance ID;
- `presentation.backgroundColor`.

Each entrance defines a position and orientation. Entrance semantics,
user-created entrance portals, and spatial safety checks remain future work.

The following optional declarations are included because the launch needs
stable locations for them:

- `authority`: authority mode and provider reference;
- `identity`: anonymous access and provider requirement;
- `avatarPolicy`: portable/world-provided avatar admission;
- `placementPolicy`: default object placement decision;
- `portalPolicy`: private/public portal admission;
- `navigation`: named zones and directed edges;
- `objects`: built-in object package placements.

These fields express policy and configuration. They do not override user
consent, authority authorization, or Browser security controls.

## 13. Object Profile

An object manifest requires:

- `bounds`: local axis-aligned size in meters;
- `ownership`: initial ownership model;
- `multiplicity`: per-world and per-user limits.

Optional declarations cover placement footprint, interactions, attachment
points, input/output ports, replication, persistence, and cleanup.

Object input and output ports are named integration contracts. Their payload
schemas may be embedded JSON Schemas or absolute schema URLs. Runtime wiring
and authority semantics belong to later proposals.

## 14. Extensions

Unknown standard fields are rejected. Experimental additions go in
`extensions`, whose keys must be reverse-domain names such as:

```json
{
  "extensions": {
    "com.3dsplaza.launch-channel": {
      "channel": "prod",
      "pollSeconds": 15
    }
  }
}
```

Extensions cannot weaken standard security requirements, grant capabilities,
or change the meaning of standard fields. A package requiring an extension
must also list the corresponding feature in `compatibility.requires`.

## 15. Failure Behavior

`failure` selects package-level behavior for optional capability denial,
dependency failure, and authority loss. The only allowed choices are explicit
reject, degrade, offline, retry, or exit modes.

`failure` and its members are optional. When `failure.optionalCapabilityDenied`
is not declared, its default is `degrade` (the runtime lifecycle proposal 0006
relies on this default so an undeclared policy is always well-defined).

Failure declarations do not require a Browser to continue running unsafe or
invalid code. Browser security termination always takes precedence.

## 16. Media Types

Provisional media types for experimentation:

- `application/webspace-world-manifest+json`
- `application/webspace-object-manifest+json`
- `application/webspace-world`
- `application/webspace-object`

These are unregistered and must not be represented as standardized IANA media
types.

## 17. Validation and Fixtures

The repository includes valid and invalid fixtures plus an AJV-based validator.
Run:

```sh
npm install
npm test
```

Schema validity is necessary but not sufficient. Implementations must also
perform semantic checks including:

- `defaultEntrance` resolves to a declared entrance;
- built-in placement IDs are unique;
- dependency and resource integrity is verified before use;
- required features and capabilities are negotiated;
- referenced resources obey origin and URL policy;
- every `package:/` reference resolves to one normalized package entry;
- bundle entries satisfy container path and resource limits;
- navigation edges reference existing zones;
- extension requirements are declared;
- resource ceilings and authority policy are enforced at runtime.

## 18. Deferred Work

P1 does not settle:

- package-source and origin-bridge implementation;
- whether the experimental ZIP-compatible container remains the stable
  container encoding;
- streaming container access and content-addressed storage;
- signatures and publisher verification;
- formal capability semantics and consent UX;
- lifecycle invocation semantics;
- dependency resolution and lock files;
- provider interfaces;
- zone geometry and navigation enforcement;
- avatar/wearable portability;
- object event and replication protocols;
- stable media-type registration;
- normative conformance.

## 19. Acceptance Criteria

P1 is ready for implementation testing when:

- world and object manifests share one explicit envelope;
- valid `.wsp.json` and `.wso.json` manifests validate;
- bundled `.wsp` and `.wso` forms preserve the same logical package and
  `package:/` namespace;
- malformed, confused-kind, unknown-field, and missing-integrity examples fail;
- a second implementation can locate entry code and assets without
  implementation-specific defaults;
- capability declarations are unambiguously requests;
- world and object policy declarations cannot be mistaken for Browser grants;
- schema and package version evolution are explicit.
- manifests, containers, HTML carriers, and transports have non-overlapping
  responsibilities.
