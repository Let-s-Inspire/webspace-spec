# 0001: Goals, Trust Boundaries, and Threat Model (experimental)

Status: **accepted design baseline for experimental proposals**. This document
is not yet normative and makes no conformance claim.

This proposal establishes the architectural and security foundation for early
Webspace work. Later proposals may refine it, but must identify and justify any
departure from it.

## 1. Problem

Interactive 3D spaces on the web need to load code, assets, identities,
avatars, multiplayer state, portals, and reusable content from parties that
may not trust one another.

Ordinary web pages already have an origin and permission model, but a Webspace
runtime introduces additional relationships:

- a Browser may load a world without navigating its trusted UI away;
- a world may load reusable objects published by other parties;
- objects may request input, networking, persistence, or authority;
- users may carry identities and avatars between worlds;
- a world may admit user-placed content or public portals;
- a dedicated server may be authoritative for world state without being
  trusted with the user's device or credentials;
- an embedding host may be different from the world publisher.

Without a shared model, implementations are likely to confuse declaration
with permission, world policy with user consent, or multiplayer authority with
device authority. That would make interoperability unsafe.

## 2. Goals

The Webspace specifications aim to:

1. Let anyone publish a world or reusable object without approval from a
   central vendor.
2. Let multiple independent Browsers implement the formats and behavior.
3. Define versioned package identities and machine-readable compatibility.
4. Preserve the web's origin transparency and cross-origin security model.
5. Run world and object code with least privilege and bounded resources.
6. Make capability requests explicit, scoped, revocable, and fail-safe.
7. Keep user consent and Browser isolation authoritative over device powers.
8. Let worlds define admission and placement policy inside their environment.
9. Let authoritative services protect shared world state without gaining
   unrelated powers.
10. Support anonymous, pseudonymous, portable, and world-specific identity
    without requiring one identity provider.
11. Support portable avatars while allowing worlds to enforce presentation,
    moderation, safety, and performance limits.
12. Define predictable lifecycle, failure, navigation, and fallback behavior.
13. Permit optional providers for networking, physics, identity, storage, and
    other facilities without making one implementation mandatory.
14. Allow experimental iteration immediately through explicit schema and
    interface versioning.

## 3. Non-goals

The initial standard does not attempt to:

- define one rendering engine, scene graph, physics engine, or programming
  language;
- require Webspace Browser, Easy Multiplayer, or any other product;
- define one global identity, avatar, economy, social graph, or asset store;
- make arbitrary world or object code trustworthy;
- let a world replace, conceal, or permanently capture trusted Browser UI;
- make transitions between web origins indistinguishable at the expense of
  origin transparency;
- guarantee seamless cross-origin XR, fullscreen, or pointer-lock continuity
  where the web platform cannot provide it;
- standardize a full multi-server sharding architecture in the first profile;
- make package metadata an enforcement boundary;
- guarantee that user-created content is acceptable to every world;
- standardize application-specific rules such as game scoring, moderation
  policy, currency value, or community roles;
- claim stable conformance before schemas, fixtures, implementations, and
  security review exist.

## 4. Terminology

**Browser**
: The trusted user agent/runtime implementing Webspace behavior. It brokers
  capabilities, isolates packages, presents consent, and retains trusted exit
  and recovery controls.

**World**
: The top-level interactive environment entered by a visitor.

**Object**
: A reusable content package instantiated inside a world, such as a game,
  building, portal, vehicle, avatar, wearable, panel, or scripted item.

**Package**
: A versioned world or object manifest plus its referenced modules and assets.

**Publisher**
: The party identified as publishing a package. Publisher identity is not
  automatically proof that a package is safe.

**Embedding host**
: The top-level web origin hosting or embedding a Browser runtime.

**World operator**
: The party operating a world and any service authoritative for that world's
  application state.

**Authority**
: A service or process accepted as authoritative for a declared state domain,
  such as a multiplayer session, inventory, or game result. Authority is
  domain-specific and does not imply general trust.

**Provider**
: An optional implementation behind a standard interface, such as a
  networking, identity, physics, or storage provider.

**Capability**
: A named, scoped operation or information flow not available to a package by
  default.

**World policy**
: Rules governing what packages, portals, avatars, or actions are admitted
  into a particular world.

**Grant**
: A Browser/user decision authorizing a requested capability within a bounded
  scope.

**Zone**
: A stable, named spatial region used by world policy. A zone is not
  necessarily a room, shard, or rendering scene.

## 5. Package Model

The initial direction uses two logical package formats:

- `.wsp` for a Webspace/world package;
- `.wso` for a Webspace object package.

Both use a shared versioned manifest envelope. The manifest's `kind` field,
not the filename extension, identifies its role:

```json
{
  "schema": "https://webspacebrowser.com/spec/package/v0",
  "kind": "world",
  "id": "com.example.world",
  "version": "0.1.0"
}
```

Common envelope concerns include:

- schema and package version;
- stable package and publisher identity;
- metadata and canonical URL;
- compatibility requirements;
- entry modules and lifecycle;
- assets and integrity;
- dependencies;
- requested capabilities;
- privacy declarations;
- resource budgets;
- failure and fallback behavior.

World-specific concerns include entry anchors, navigation, authority,
identity-provider requirements, avatar policy, object-placement policy, portal
policy, and presentation defaults.

Object-specific concerns include bounds, placement footprint, ownership,
interactions, replication, persistence, attachment points, inputs, outputs,
result events, multiplicity, and cleanup.

A `.wsp` may reference built-in `.wso` packages. An object retains its own
package identity and capability boundary even when selected or distributed by
a world.

The full field-level schemas belong in later proposals. This document fixes
only the separation of roles and shared security model.

## 6. Actors and Trust Boundaries

### 6.1 User

The user controls their device, identity disclosure, privileged input,
permissions, and navigation away from a world. A Browser may remember grants
according to user policy, but a world cannot manufacture consent.

### 6.2 Browser

The Browser is trusted to:

- isolate packages;
- enforce capability grants and revocation;
- preserve trusted UI and an exit path;
- mediate sensitive identity and device access;
- enforce resource limits;
- validate package and handoff structures;
- represent origins and publishers honestly.

A Browser implementation may be buggy or malicious. The standard cannot
protect a user from a Browser they chose to trust, but conformance tests and
transparent behavior can reduce that risk.

### 6.3 Embedding Host

An embedding host controls its own page and origin. It is not automatically
trusted by a world, package publisher, identity provider, or destination
origin. It must not receive package secrets merely because it embeds a
runtime.

### 6.4 World Package

World code is untrusted by default. It may define policy for its own
environment and request capabilities, but cannot:

- grant itself Browser capabilities;
- authorize itself as an identity or authority provider;
- hide the true destination origin;
- disable the user's durable exit path;
- expand an object's effective capabilities beyond its grants.

### 6.5 Object Package

Object code is independently untrusted, including when referenced by a trusted
or first-party world. It is constrained by its own requests, Browser grants,
world policy, authority rules, and resource budget.

Loading an object never transfers all world privileges to that object.

### 6.6 World Authority

A world authority may be trusted for explicitly named application state, for
example:

- session membership and roles;
- synchronized transforms and object state;
- moderation actions;
- inventory and currency;
- game outcomes;
- persistent placement.

It is not thereby trusted with microphone access, credentials, clipboard,
files, global identity, Browser navigation, or other device powers.

### 6.7 Provider

A provider is trusted only for its declared interface and scope. A networking
provider does not become an identity authority. An identity provider does not
gain permission to modify a world. Provider substitution must not silently
change security semantics.

### 6.8 Other Users and Peers

Remote peers are untrusted. Client assertions about identity, roles, economy,
moderation, inventory, or certified results are not authoritative merely
because they arrive through an approved networking provider.

## 7. Effective-Power Rule

For a package and operation, effective power is the intersection of:

1. the capability the package declared and requested;
2. the capability the Browser and user granted;
3. the containing world's admission policy;
4. any authorization required from the relevant authority;
5. implementation and resource limits.

Conceptually:

```text
effective power =
  package request
  AND Browser/user grant
  AND world admission
  AND authority authorization when required
  AND runtime limits
```

No participant may amplify another participant's authority. A world may
further restrict an object but cannot grant device access the Browser denied.
An authority may authorize a shared-state mutation but cannot grant microphone
access. A user grant does not force a world to admit an object.

## 8. Capability Model

### 8.1 Baseline Sandbox

Later proposals must define the small set of operations available without a
prompt. Baseline access should be limited to what is necessary to initialize,
render within the assigned scope, receive bounded lifecycle events, and fail
cleanly.

Stable identifiers, unrestricted networking, persistent storage, privileged
input, and device access are not assumed baseline.

### 8.2 Requests

A capability request should identify:

- a versioned capability name;
- whether it is required or optional;
- a human-readable reason;
- resource, target, and operation scope;
- requested duration;
- whether delegation to child objects is requested;
- fallback behavior when refused or unavailable.

### 8.3 Grants

Grants should be:

- least-privilege;
- scoped to a package identity and version-compatible context;
- bounded by target, operation, and duration;
- revocable;
- observable through trusted Browser UI;
- invalidated or reconsidered when relevant identity, origin, publisher, or
  package-integrity assumptions change.

Consent presentation is a Browser responsibility. A manifest may supply a
reason but cannot dictate trusted consent UI.

### 8.4 Delegation

Delegation is denied by default. If a world is granted a capability, objects
it loads do not inherit it automatically.

A future delegation mechanism must:

- be explicitly declared;
- name the child package or bounded category;
- narrow rather than expand the parent grant;
- remain revocable;
- preserve attribution in trusted UI and logs.

### 8.5 Revocation and Failure

Packages must tolerate revocation, denial, timeout, unavailable providers, and
partial support. Unknown capabilities fail closed. Required capability denial
may prevent package entry, but must produce a clear, recoverable outcome.
Optional capability denial must use the declared fallback.

### 8.6 Non-delegable Browser Powers

At minimum, packages cannot receive authority to:

- remove all trusted exit and recovery controls;
- falsify the address bar or destination origin;
- approve their own capability requests;
- read raw identity-provider credentials or private keys;
- escape package isolation;
- grant capabilities to unrelated packages;
- suppress safety-critical Browser notices indefinitely.

## 9. Capability Families Requiring Dedicated Review

The following families require separate proposals and threat analysis:

- user pose read or override;
- replacement of native movement/orientation controls;
- pointer lock, keyboard lock, fullscreen, and XR;
- microphone, camera, spatial voice, and recording;
- clipboard, files, local devices, and notifications;
- persistent or cross-world storage;
- identity and avatar disclosure;
- payments, inventory, and economy operations;
- unrestricted or cross-origin networking;
- opening external URLs or top-level navigation;
- screenshot, scene capture, or generated user imagery;
- public content, portal, or persistent-world mutation;
- communication between packages or worlds.

Browser controls that affect normal navigation or input capture must always
have deterministic release behavior on cancellation, blur, package removal,
navigation, session end, or device disconnect.

## 10. World Policy

World policy governs admission into the world, not device permission.

Default policy for visitor-supplied objects and public portals is **deny**.
Worlds may permit:

- explicitly listed package IDs and versions;
- packages signed by allowed publishers;
- declared categories under bounded capability/resource profiles;
- private or local-only instances;
- temporary shared instances;
- persistent authority-approved instances;
- placement only within named zones;
- per-user, per-zone, and world-wide quotas.

World policy should use explicit allow rules rather than relying on a blacklist
for untrusted active content.

Policy changes affecting existing instances need defined behavior: grandfather,
quarantine, disable, remove, or require renewed approval.

## 11. Portals, Entrances, and Navigation

### 11.1 Portals

Portal policy separates:

- who may create a portal;
- whether it is private, party-scoped, public, temporary, or persistent;
- where its source may be placed;
- which destinations are allowed;
- whether world authority approval is required;
- who may traverse it.

A public portal is shared-world state and generally requires world-authority
authorization. A private visual portal may remain local state if the world
admits it.

### 11.2 Entrances

Worlds may declare named safe entrance anchors containing position and
orientation, and named zones in which entrance portals may be materialized.
They may offer multiple role-, capacity-, or route-specific entrances.

An authority may select among declared valid entrances. Spawn and pose behavior
outside declared policy requires the corresponding capability and must retain
a safe fallback.

### 11.3 Navigation Graph

A world navigation graph may describe named spaces and permitted in-world
transitions. It can govern world-provided navigation and authority-approved
portals.

It cannot prevent the user from leaving through trusted Browser controls,
navigating directly to another URL, using Back, or closing the page. Graph
restrictions are world application policy, not ownership of the user agent.

Cross-origin transitions must expose the real destination origin and degrade
to ordinary web navigation when continuity features are unavailable.

## 12. Identity and Roles

World code never receives passwords, private keys, or raw provider sessions.
Identity is brokered by the Browser and verified by the relevant authority for
security-sensitive actions.

The privacy-preserving baseline is anonymous access. A stable per-world
pseudonym may be offered according to Browser policy, but its creation,
disclosure, lifetime, and reset behavior must be transparent and must not
enable cross-world correlation.

Global or external identity disclosure requires stronger consent. Claims about
membership, moderator status, inventory, economy, or access must be verified
by an authority that owns those claims.

Worlds must define behavior when requested identity is denied, unavailable, or
weaker than requested.

## 13. Avatars and Wearables

Worlds may declare one of these broad avatar admission modes:

- arbitrary portable avatars within safety/resource policy;
- allowlisted packages or publishers;
- world-provided avatars only;
- no visible avatar.

Portable avatar identity does not imply permission to execute arbitrary avatar
scripts. Geometry, materials, animation, attachments, behavior, voice,
collision, and active code may have separate policies.

Worlds may substitute or simplify avatars for moderation, accessibility,
performance, or safety, but should represent this behavior honestly.

World-specific wearables and cosmetics remain world application state unless a
later portability specification defines otherwise.

## 14. Authority and Shared State

Manifests may declare an authority mode and provider, but declaration does not
establish trust.

The Browser must distinguish at least:

- local/offline state;
- peer-replicated state with no trusted authority;
- host-authoritative state;
- dedicated-authority state.

Packages must not present peer agreement as certified authority. Protected
identity, moderation, economy, persistent inventory, and certified game
results require verification by the service that owns that state.

Authority protocols need explicit:

- state and action domains;
- authentication and authorization;
- replay protection;
- reconnect and resynchronization behavior;
- conflict handling;
- capacity and admission behavior;
- failure and migration behavior.

## 15. Execution and Supply-Chain Isolation

Package scripts should execute in a bounded worker, realm, process, or
equivalent isolation boundary. Direct execution in trusted Browser or embedding
host context is not the default package model.

Implementations must account for:

- malicious or compromised package modules;
- compromised transitive dependencies;
- mutable remote assets;
- publisher-key compromise;
- manifest/module substitution;
- stale vulnerable package versions;
- dependency confusion;
- decompression bombs and oversized assets.

Later package proposals should support integrity-addressed immutable releases.
Integrity proves which bytes were loaded, not that the bytes are safe.

## 16. Resource and Availability Safety

Packages can attack availability accidentally or deliberately. Browsers should
be able to bound:

- total downloads and decompressed size;
- memory;
- CPU/update time;
- workers and concurrent tasks;
- geometry, textures, audio, and shader complexity;
- network connections, bandwidth, and request frequency;
- persistent storage;
- spawned instances;
- event and log volume.

Limit exhaustion must not make trusted Browser controls unavailable. The
Browser may throttle, suspend, simplify, isolate, or terminate a package and
should report the reason.

## 17. Privacy Model

Data minimization is the default. Packages should declare material collection
and transmission, but declarations do not replace enforcement or consent.

Sensitive data includes:

- identity and correlatable pseudonyms;
- pose, movement, gaze, hand, and interaction telemetry;
- microphone, camera, and generated captures;
- social graph and presence;
- device characteristics;
- precise location;
- clipboard, files, and local storage;
- payment, inventory, and behavioral history.

Capability scopes should limit destination origins and retention where
enforceable. Worlds and providers must not combine separately scoped data to
circumvent consent.

## 18. Assets and Security Objectives

The model protects:

- user agency and a reliable exit path;
- origin and publisher transparency;
- device confidentiality and integrity;
- credentials and private keys;
- scoped identity and privacy;
- avatar and social information;
- world and object isolation;
- authoritative shared state;
- economy and inventory integrity;
- package and update integrity;
- service availability;
- predictable navigation and recovery.

## 19. Threat Actors and Representative Threats

### Malicious world

- requests excessive permissions;
- imitates Browser consent or origin UI;
- captures input indefinitely;
- tracks users across worlds;
- loads a privileged child to evade its own limits;
- sends pose, voice, or identity to undeclared destinations.

### Malicious object

- assumes parent-world privileges;
- escapes its spatial or execution boundary;
- impersonates another package;
- floods replication or events;
- persists after removal;
- modifies world state without authority.

### Malicious or compromised authority

- forges application state;
- correlates identities;
- withholds or reorders events;
- exceeds its declared state domain;
- attempts to turn server authorization into device permission.

### Malicious peer or user

- spoofs identity or roles;
- replays actions;
- sends malformed or oversized state;
- manipulates game results;
- evades placement quotas;
- abuses public communication or portals.

### Malicious embedding host

- overlays deceptive UI;
- observes or interferes with input;
- misrepresents the loaded world;
- steals handoff data;
- attempts to inherit world identity or grants.

### Compromised publisher or dependency

- ships a malicious update under a previously trusted identity;
- replaces mutable assets;
- compromises a transitive module;
- exploits overly broad remembered grants.

### Colluding worlds/providers

- correlate pseudonyms, device signals, pose, or timing;
- combine independently granted datasets;
- use handoff tokens as tracking identifiers.

### Network attacker

The model assumes normal web transport security for protected origins.
Implementations must still reject substitution, replay, downgrade, and
cross-origin confusion. Insecure transport cannot carry claims requiring
authenticated integrity.

### Buggy package or implementation

Security and recovery behavior must handle accidental infinite loops, invalid
geometry, corrupt assets, malformed events, race conditions, and incompatible
versions as well as deliberate attacks.

## 20. Required Fail-Safe Behavior

- Unknown schema major versions do not load as a known version.
- Unknown capabilities are denied.
- Missing required capabilities prevent entry with a clear error.
- Missing optional capabilities invoke declared fallback behavior.
- Invalid authority or identity proofs do not become authenticated state.
- Invalid handoff data is ignored and normal navigation continues.
- Failed object loading does not corrupt the containing world.
- Failed world loading leaves trusted Browser recovery/navigation available.
- Revoked input and device capabilities stop promptly.
- Unsupported content does not silently receive broader legacy behavior.

## 21. Versioning and Evolution

Schema identity and package release version are separate:

- `schema` identifies the manifest contract;
- `version` identifies a package release.

Experimental schemas use explicit versioned identifiers and make no stable
conformance claim. Breaking schema changes require a new major schema version.
Additive fields must define older-reader behavior.

Packages should declare required and optional interfaces independently.
Implementations negotiate support rather than inferring it from a product
name.

Unknown fields may be preserved for tooling, but must not activate behavior
unless their defining extension is understood and permitted.

## 22. Experimental Launch Profile

The first 3DSPlaza/Webspace Browser launch may use a deliberately narrow
profile:

- one `.wsp` world package;
- built-in `.wso` objects;
- anonymous visitors;
- one external 3DSPlaza identity provider;
- guest/member/moderator distinctions;
- one dedicated authority mode;
- bounded world-controlled movement;
- explicitly declared chat, avatar, voice, portal, and placement behavior;
- deny-by-default visitor content placement;
- same-origin embedding for the main launch;
- ordinary navigation fallback;
- versioned immutable releases.

This profile is implementation experience, not proof of a stable universal
standard. Launch-specific fields must not silently become normative.

## 23. Consequences for Follow-up Proposals

### Package manifests (`.wsp` and `.wso`)

Must define the shared envelope, role-specific profiles, integrity,
compatibility, lifecycle references, capability requests, policies, limits,
and fallback behavior.

### Lifecycle

Must define initialization, loading, readiness, entry, pause, suspension,
revocation, unload, failure, and cleanup for worlds and objects.

### Interaction

Must define semantic actions and deterministic ownership/release across mouse,
touch, keyboard, gamepad, and XR without exposing unnecessary raw input.

### Identity

Must preserve brokered credentials, scoped disclosure, proof verification, and
anonymous fallback. Any automatic pseudonym behavior must be reconciled with
the privacy rules here.

### Embedding and navigation

Must preserve origin transparency, trusted exit, untrusted handoff data, and
ordinary-navigation fallback.

### Authority and networking

Must separate transport, replication, and authority. Provider selection cannot
change security semantics silently.

### Avatars

Must separate visual portability, active behavior, identity, attachments, and
world admission policy.

## 24. Open Questions

- Exact baseline sandbox API available without capability grants.
- Capability naming, versioning, grouping, and consent persistence.
- Package/publisher verification and delegation mechanisms.
- Integrity representation for manifests, modules, assets, and dependencies.
- Whether a stable package ID is origin-bound, publisher-bound, or supports
  verified delegation.
- Exact zone and navigation-graph representation.
- How privacy declarations become inspectable and testable.
- Minimum enforceable resource-budget vocabulary.
- Rules for upgrading remembered grants across package versions.
- Governance and review requirements for moving proposals toward normative
  status.

## 25. Acceptance Criteria for S0

S0 is complete when follow-up work can answer these questions without
inventing a conflicting trust model:

- Who requests, grants, admits, and authorizes an operation?
- Which actor is authoritative for the affected state?
- What data crosses each trust boundary?
- What is the least required scope?
- What happens on denial, revocation, failure, or incompatibility?
- Which behavior is core, optional, provider-specific, or application-specific?
- How can a second Browser implement it without depending on the reference
  implementation?

This proposal answers those questions at the architectural level. Field-level
schemas, APIs, and conformance fixtures remain follow-up work.
