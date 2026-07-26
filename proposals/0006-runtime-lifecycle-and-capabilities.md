# 0006: Runtime Lifecycle and Capability API (experimental)

Status: **exploratory**. Not normative, no conformance claim. Proposal numbering is
provisional.

Depends on:

- [0001: Goals, Trust Boundaries, and Threat Model](0001-goals-trust-and-threat-model.md)
- [0002: Experimental Package and Container Profile](0002-experimental-package-profile.md)
- [0005: Package Sources and Origin Bridge Protocol](0005-package-sources-and-origin-bridge.md)

Maps to launch node **P2** (runtime lifecycle and capability API). Feeds the top-level
package loader (**R2**) and the interaction contract (**P3**). This proposal reconciles and
standardizes the behavior already present in the reference implementation (Webspace Browser)
where that behavior is sound, and flags the contradictions and unresolved decisions
explicitly in section 15.

## 1. Problem

A Webspace Browser runs many mutually-distrusting packages: one top-level world plus zero or
more reusable objects, each untrusted, each in its own isolation boundary. Without a shared
lifecycle and capability contract, every implementation would invent its own start/stop
rules, its own readiness signal, its own failure handling, and its own idea of what a package
is allowed to do. Worlds and objects would then behave differently across browsers, cleanup
would leak, failures would hang, and "declared" would silently become "permitted."

This proposal defines the transition from a validated package (the output of 0002/0005) to a
running instance, the states and callbacks in between, the rules for cancellation, failure,
and cleanup, and how a package's requested capabilities are negotiated, granted, denied, and
revoked at runtime.

## 2. Why ordinary web capabilities are insufficient

- **Package code is untrusted and isolated.** It does not run in the browser's document, so
  ordinary page load/unload events do not describe it. The runtime must define an explicit
  lifecycle across the isolation boundary.
- **There is no web primitive for "a reusable, sandboxed, capability-scoped 3D instance"**
  with deterministic ready/enter/pause/unload semantics and idempotent teardown.
- **Capabilities must be enforced, not merely declared.** The web platform grants page
  powers to an origin, but a Webspace needs per-package, per-scope, revocable grants that a
  manifest can only *request* (per 0001).

## 3. Goals and non-goals

Goals:

- One lifecycle state machine for world and object instances, with explicit legal transitions.
- Deterministic ready, enter, pause, resume, unload, error, and teardown semantics.
- Bounded cancellation, timeout, and failure behavior, and idempotent cleanup.
- A capability negotiation model that realizes 0001's request/grant/deny/revoke rules at
  runtime, including required-versus-optional behavior.
- Reconciliation with the reference implementation where its behavior is sound.

Non-goals:

- Defining the rendering, scene, or scripting API a package sees (out of scope).
- Defining the interaction/input contract (that is P3).
- Defining networking, authority, or replication (that is P5 and later).
- Re-specifying acquisition, container decoding, manifest validation, or integrity (0002/0005).
- Mandating Web Workers specifically. This proposal specifies an isolation *boundary* and its
  ownership, not a single browser technology.

## 4. Scope boundary with 0002 and 0005

- **0005** owns acquisition: fetch/bridge/relay/local source, container decode, and closing
  the source. **0002** owns manifest shape, `entry`, integrity, and capability *requests*.
- **This proposal begins the moment a validated package is ready to execute** and ends when
  its instance is fully torn down. The handoff point is: bytes acquired, container decoded,
  manifest validated against the P1 schema, integrity verified, and compatibility negotiated.
  Teardown here always closes the 0005 source (0005 section 23).
- The lifecycle callback names (`load`, `ready`, `enter`, `pause`, `resume`, `unload`) come
  from 0002 section 7. This proposal defines *when* they fire and the states between them, and
  adds the runtime `error` and `teardown` semantics 0002 left to the lifecycle proposal.

## 5. Instance model

- A **world instance** is the top-level environment for a visit. Exactly one is active per
  browsing context at a time. It owns the world-scoped facilities (networking/authority,
  identity brokering, presence, and the shared clock).
- An **object instance** is a reusable package (`.wso`) instantiated inside a world. Zero or
  more may exist, each independently. An object owns none of the world-scoped facilities.
- Both are **instances** and share the same lifecycle state machine and callback contract.
  Where they differ (enter trigger, multiplicity, ownership) is specified in section 12.
- Each instance runs in its own **isolation boundary** with a single owner (section 13).

## 6. Lifecycle states

```text
                 (0002/0005 handoff: validated, executable)
                                 |
                                 v
   +-----------+     +---------+     +--------+     +---------+
   | acquired  | --> | loading | --> | ready  | --> | active  |
   +-----------+     +---------+     +--------+     +----+----+
                          |              |            |   ^
                          |              |     pause  |   | resume
                          |              |            v   |
                          |              |          +---------+
                          |              |          | paused  |
                          |              |          +----+----+
                          |              |               |
        (any state) ------+--------------+---------------+---> failed
                          |              |               |
                          +--------------+---------------+---> unloading --> unloaded
```

- **acquired**: validated and executable, no code run yet.
- **loading**: the entry module is instantiated and the `load` callback runs. Preload-phase
  modules and declared assets are prepared. Capability negotiation (section 10) completes here.
- **ready**: the instance can produce its first frame and has signalled readiness, but is not
  yet live/entered. Corresponds to first-frame priming in the reference implementation.
- **active**: `enter` has run and the instance is being driven (ticked/drawn).
- **paused**: the instance is suspended, not driven, retaining state. Reached from `active`
  via `pause`, left via `resume`.
- **failed**: a terminal error state reached from any prior state. It always proceeds to
  teardown.
- **unloading / unloaded**: teardown is running / complete. The isolation boundary is
  released and the 0005 source is closed.

## 7. Lifecycle callbacks

Callbacks are optional exports (0002 section 7). The runtime invokes them; a package need not
implement any.

| Callback | Fires when entering | Cardinality |
|---|---|---|
| `load` | loading | at most once |
| `ready` | ready | at most once |
| `enter` | active (first time) | at most once |
| `pause` | active -> paused | zero or more |
| `resume` | paused -> active | zero or more |
| `unload` | unloading | at most once |

- `error` and `teardown` are runtime concerns, not required package exports. A package MAY
  export an error hook, but the runtime's failure and cleanup behavior does not depend on it.
- `enter` fires **once**, on the first activation. Re-activation after pause uses `resume`,
  not `enter`.
- A callback that throws or times out transitions the instance to `failed` (section 9).

## 8. Legal transitions

| From | To | Cause |
|---|---|---|
| acquired | loading | runtime begins execution |
| loading | ready | load complete, readiness signalled |
| ready | active | enter (activation) |
| active | paused | pause |
| paused | active | resume |
| loading, ready, active, paused | failed | error or timeout |
| any | unloading | teardown requested (navigation, replacement, failure cleanup) |
| unloading | unloaded | cleanup complete |
| failed | unloading | cleanup after failure |

All other transitions are illegal. In particular: no `enter` from `paused` (use `resume`), no
return from `failed` except to teardown, and no re-entry of a terminal `unloaded` instance
(a new instance is created instead).

## 9. Cancellation, timeout, failure, cleanup, idempotency

- **Bounded phases.** `loading` and the `ready` transition are bounded by a browser-supplied
  timeout. Exceeding it transitions the instance to `failed`. (The reference implementation
  today has no per-load timeout and relies on a splash fallback. This proposal requires an
  explicit bound.)
- **Cancellation.** Navigating away or replacing an instance before it reaches `active` must
  transition it to `unloading` and abort pending work. Cancellation is not an error, and it
  must not leave a live boundary.
- **Failure.** Any thrown or timed-out callback, an isolation-boundary crash, or a validation
  failure surfaced during execution transitions to `failed`, then teardown. A failed world
  must leave the browser's trusted UI and navigation available (0001 section 20). A failed
  object must not corrupt its containing world.
- **Cleanup.** Teardown releases the isolation boundary (terminates the worker), removes the
  instance's contribution to the world, releases owned resources (GPU handles, audio, ports,
  network sessions), and closes the 0005 source.
- **Idempotency (required).** `teardown` MUST be idempotent and callable from any state. A
  second teardown is a no-op. Each lifecycle callback fires at most its stated cardinality
  regardless of redundant triggers. (The reference implementation's teardown is currently
  non-idempotent and safe only by side effect, see section 15. This proposal requires an
  explicit guard.)
- **Single ownership of the boundary.** Exactly one owner may terminate an instance's
  isolation boundary. Termination is the single teardown ownership point.

## 10. Capability request, negotiation, grant, denial, revocation

This realizes 0001 section 8 at runtime.

- **Request.** Capabilities are declared in the manifest (0002 section 9): a versioned dotted
  `name`, `required` flag, human `reason`, and `scope`. A runtime dynamic-request path MAY
  exist, but is not required for the launch profile.
- **Negotiation.** During `loading`, the runtime resolves each requested capability to
  **granted** or **denied** using the 0001 effective-power intersection (package request AND
  browser/user grant AND world admission AND authority authorization when required AND runtime
  limits). Consent presentation is a browser responsibility.
- **Grant.** A grant is least-privilege, scoped to the package identity and version-compatible
  context, bounded by target/operation/duration, observable in trusted UI, and revocable.
- **Required vs optional.**
  - A **required** capability that is denied prevents `enter`. The instance produces a clear,
    recoverable failure rather than entering with the capability absent.
  - An **optional** capability that is denied lets the instance proceed using its declared
    `fallback` behavior. Optional denial never blocks entry.
- **Unknown capabilities fail closed.** An unknown required capability prevents entry. An
  unknown optional capability is ignored (0001 section 20).
- **Revocation.** The runtime MAY revoke a granted capability at any time. The package must
  tolerate revocation: the operation the capability gated stops promptly, and the package
  degrades to its optional-denied fallback or, for a required capability, is torn down. Input
  and device capabilities must stop promptly on revocation (0001 section 9).
- **Enforcement, not declaration.** A granted capability gates real runtime operations. A
  package that was denied a capability cannot perform the gated operation. Declaration alone
  never confers the power (0001 effective-power rule).

## 11. Loading progress semantics

- **Progress is advisory and never a correctness gate.** An instance that reports no progress
  still loads. Progress, when reported, is either a monotonic fraction in `[0, 1]` or an
  explicit indeterminate state, and must not decrease.
- **Readiness is distinct from progress.** The transition to `ready` (first-frame priming) is
  the signal a browser uses to decide the instance can be shown, independent of any reported
  fraction.
- **The browser owns loading UI.** A browser MAY show a splash or placeholder until `ready`,
  with a maximum wait after which it proceeds or fails deterministically. A package cannot
  hold the browser in a loading state indefinitely.

## 12. World versus object lifecycle differences

Same state machine and callbacks, with these differences:

| Concern | World instance | Object instance |
|---|---|---|
| Multiplicity | exactly one active | zero or more |
| Enter trigger | activation on navigation-ready | activation on placement/becoming-active in its context |
| Owns world facilities | yes (networking/authority, identity broker, presence, clock) | no |
| Teardown trigger | navigation away or replacement | removal from its context (for example a replicated placement roster) |
| Replacement | new world instance via navigation | dispose and re-instantiate when its package identity or key placement inputs change |

- **Enter-once discipline for objects.** An object's `enter` fires when it first becomes
  active in its context, not merely when it is instantiated. Re-declaring or re-syncing an
  already-active object must not re-fire `enter`. (This matches the reference implementation's
  "start on placed transition, not on spawn" behavior.)
- **Object replacement** is teardown of the old instance followed by a full lifecycle for the
  new one. No lifecycle state carries over implicitly. Any state hand-off is an explicit
  re-hydration, not a shortcut around `load`/`ready`/`enter`.

## 13. Isolation and ownership

- Each instance executes in its own **isolation boundary** (0001 section 15). The reference
  implementation uses one dedicated Web Worker per instance, with the untrusted module
  imported only after nested-worker creation is disabled inside the boundary. Standardized:
  **a package MUST NOT create further isolation boundaries** (no nested workers), and the
  browser enforces this.
- The browser (not the package) **owns the boundary handle and its lifetime**. There is a
  single termination point per instance (section 9).
- The API surface exposed inside the boundary is defined elsewhere (rendering/scripting spec,
  out of scope here). This proposal only fixes that the surface is bounded and that the
  boundary is owned and terminable by the runtime.

## 14. Behavior during navigation, reload, replacement, failed startup

- **Navigation away.** The current world instance transitions to `unloading` and is torn down
  (boundary terminated, source closed). Cross-origin continuity and identity are governed by
  0004 and 0003. A world navigation graph cannot trap the user (0001 section 11.3).
- **Reload.** A fresh acquisition and full lifecycle. No dependence on prior in-memory state.
- **Replacement.** Replacing an instance is teardown of the old followed by a full lifecycle
  for the new (section 12). The old instance's boundary is terminated before or concurrently
  with the new instance loading, and the old instance never continues to drive output.
- **Failed startup.** Transition to `failed`, surface a clear and recoverable error, run
  teardown, and keep trusted browser recovery/navigation available (0001 section 20). A failed
  startup must not leave a half-initialized boundary or a stuck loading state.

## 15. Reconciliation with the reference implementation

The following current behaviors are **sound and standardized** by this proposal: one dedicated
isolation boundary per instance with nested workers disabled before untrusted import; a single
boundary-termination ownership point; declarative, roster-reconciled object instances that
`enter` on placement rather than on spawn; readiness gated on the first real content frame with
a maximum-wait fallback; and a spawn-time capability check that fails closed on an unknown or
unsatisfied required capability.

The following are **contradictions or gaps** the implementation must converge on, called out
so the spec is not mistaken for current behavior:

1. **No explicit state machine.** Lifecycle is tracked by scattered booleans (`loaded`,
   `readyForFrame`, `started`, `firstContentUpdateHad`) across two objects with overlapping
   names. The spec's states should replace the boolean soup.
2. **`Start` is overloaded** to mean both "initialize the deterministic simulation" and "tell
   the boundary to begin its loop." These are different transitions and need different names.
3. **No pause/resume.** Inactive worlds keep drawing and broadcasting. The spec defines
   `pause`/`resume`, which currently have nothing to map to. Whether launch needs them is an
   open decision (section 16).
4. **No error state and no load timeout.** An import failure is only logged; the instance
   never reaches ready and never fails cleanly. The spec requires a `failed` state, a bounded
   load timeout, and a recoverable error surface.
5. **Non-idempotent teardown, invoked twice.** Teardown has no re-entrancy guard and the
   unload path calls the boundary's destroy twice, safe today only by side effect. The spec
   requires idempotent teardown.
6. **Ready signal is an untyped magic string.** The boundary-ready message is a bare string
   compared by value while every other message is type-tagged. The spec requires typed
   lifecycle signalling.
7. **Capability enforcement is dormant and mis-wired.** Two of the three defined capabilities
   are never checked at runtime, the allowed-capability source the check calls is not
   implemented, and real content resolves to an empty required set, so the check never fires
   for production packages. The spec requires actual enforcement and a defined baseline
   sandbox (an open question in 0001 section 8.1).
8. **Divergent enter triggers.** World `enter` is triggered by scene-ready while object
   `enter` is triggered by a placement transition. The spec unifies these as "activation in
   context," and the two code paths should converge on it.
9. **Readiness by timer.** A fixed multi-second clock-ready delay stands in for a real
   handshake. The spec defines readiness by an explicit ready signal, not a timer.
10. **Legacy/duplicate stacks and dead messages.** A stale parallel navigation module with
    mismatched constructor arguments, and handled-but-unsent message types, should not be
    read as the live protocol. The spec describes the live path only.

## 16. Open decisions and unresolved questions

- **Pause/resume at launch:** define now (done here) but is any pause/resume behavior a launch
  requirement, or is backgrounded-tab throttling sufficient? Recommendation: not a launch gate.
- **Baseline sandbox:** the exact set of operations available with no capability grant is still
  open (0001 section 8.1). This proposal assumes a minimal baseline (initialize, render within
  assigned scope, receive lifecycle events, fail cleanly) but does not enumerate it.
- **Dynamic (runtime) capability requests:** support at launch, or manifest-declared requests
  only? Recommendation: static manifest requests only for launch, keep the dynamic path
  versioned for later.
- **Revocation at launch:** the contract is defined, but is runtime revocation implemented for
  launch or deferred? Recommendation: define the contract, implement at least device/input
  capability revocation, defer the rest.
- **Timeout values and progress channel shape:** the exact load-timeout budget and whether
  progress is an explicit message or inferred from first content are left to R2.
- **Error taxonomy:** whether lifecycle errors reuse the 0005 error vocabulary or define their
  own set of load/enter/runtime error codes.

## 17. Schemas and fixtures

This proposal adds one machine-verifiable schema where it gives real coverage: the capability
negotiation message (`schemas/experimental/v0/capability-negotiation.schema.json`), covering a
capability **request** set and a capability **resolution** set (grant/deny with
required/optional and fallback), with valid and invalid fixtures. The lifecycle state machine
itself is specified in prose and transition tables rather than a schema, because it is control
flow, not a data shape. Passing the schema suite does not imply conformance.

## 18. Relationship to other proposals

- **0001** supplies the trust model, the effective-power rule, the capability request/grant
  rules, and the fail-safe requirements this proposal realizes at runtime.
- **0002** supplies the manifest, the lifecycle callback names, and the capability request
  fields. This proposal defines when they fire.
- **0005** hands off a validated, executable package and requires that teardown closes the
  source.
- **R2** (the top-level loader, not yet built) implements this lifecycle. This proposal does
  not implement R2.
- **P3** (interaction) builds on `active`/`paused` and on input-capability grants defined here.

## 19. Acceptance criteria

This proposal is ready for implementation testing when:

- the state machine, legal transitions, and callback cardinalities are unambiguous;
- cancellation, timeout, failure, and idempotent teardown are defined for every state;
- required-versus-optional capability behavior and revocation are defined and consistent with
  0001;
- world and object lifecycle differences are explicit and reconciled to one enter discipline;
- isolation ownership and single-termination are stated;
- navigation, reload, replacement, and failed-startup behavior are defined;
- the reference implementation's sound behavior is standardized and its contradictions are
  listed as convergence work, not hidden.
