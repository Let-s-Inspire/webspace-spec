# 0007: Interaction and Input Contract (experimental)

Status: **exploratory**. Not normative, no conformance claim. Proposal numbering
is provisional.

Depends on:

- [0001: Goals, Trust Boundaries, and Threat Model](0001-goals-trust-and-threat-model.md)
- [0002: Experimental Package and Container Profile](0002-experimental-package-profile.md)
- [0006: Runtime Lifecycle and Capability API](0006-runtime-lifecycle-and-capabilities.md)

Maps to launch node **P3** (unified input and interaction contract) and feeds
**R3** (cross-device interaction foundation) and **C1** (content/game
integration API). It reconciles the current Webspace Browser implementation
recorded in the
[P3 implementation inventory](https://github.com/Let-s-Inspire/webspace-browser/blob/main/docs/p3-interaction-input-design-inventory-2026-07-26.md).

## 1. Scope, principles, and Browser enforcement

This proposal defines how a trusted Browser turns local mouse, pointer, touch,
keyboard, gamepad, and XR input into bounded semantic interaction delivered to
an untrusted world or object package. It also defines focus, capture, temporary
movement/look suppression, text editing, lock requests, cancellation, and
failure behavior.

The Browser is the sole enforcement boundary. A package can declare an
affordance and request a capability; it cannot install listeners in the
Browser's trusted document, choose the current input owner, acquire Pointer
Lock or Keyboard Lock, read the clipboard, suppress trusted UI, or override the
universal escape path. Embedders configure Browser policy through public
Browser options and cannot silently delegate these powers to a world.

The launch contract is deliberately narrow:

- semantic pointing, activation, grabbing, dragging, release, and cancellation;
- one focused world surface and one captured interaction per pointer/hand;
- flat-screen mouse, touch, keyboard, and gamepad mappings;
- XR controller ray and grip mappings;
- Browser-mediated plain-text editing, selection, paste/copy/cut, and IME;
- bounded pointer-lock behavior and an explicitly unsupported launch
  Keyboard-Lock grant;
- deterministic cleanup of local interaction ownership.

It does not standardize authoritative multiplayer ownership, physics, combat,
economy, arbitrary gestures, hand tracking, rich clipboard data, global key
remapping UI, or a general DOM/event compatibility layer.

## 2. Semantic actions and target affordances

Packages declare stable target ids and supported semantic actions. Device
events are Browser inputs, not the package contract. The six launch actions are:

- `point`: identify or update a candidate target and bounded target-relative
  coordinates without committing an operation.
- `activate`: commit the target's primary action after a valid press/release or
  equivalent accessibility sequence.
- `grab`: request direct manipulation intent for a reachable target. This is
  local intent and never proof of authoritative simulation ownership.
- `drag`: update a captured target after the Browser's drag threshold is
  crossed.
- `release`: normally end a grab or drag and release its associated capture,
  temporary lock, and routed-input ownership.
- `cancel`: abort an incomplete or interrupted interaction and perform the same
  idempotent resource cleanup without activation.

A target declaration contains:

```js
{
  id: "stable-package-local-id",
  actions: ["point", "activate", "drag"],
  focusable: true,
  textEditable: false,
  activationRepeat: "none",
  coordinateSpace: "surface-uv",
  cursor: "pointer",
  hands: ["left", "right"]
}
```

- `id` is unique within the package instance and stable for the target's
  lifetime. The Browser qualifies it with the instance id.
- `actions` is an allow-list. Undeclared actions are not delivered.
- `focusable` and `textEditable` are affordances, not grants.
- `activationRepeat` is `none` (the default) or `while-held`; section 5 defines
  the one repeat lifecycle shared by every input source.
- `coordinateSpace` is `none`, `surface-uv`, or `local-meters`. Values are
  finite and Browser-clamped. World-space rays and raw DOM events are not
  exposed by this contract.
- `cursor` is an advisory Browser cursor/reticle hint.
- `hands` restricts direct grab intent to `left`, `right`, or both.

The Browser hit-tests only active instances. Trusted Browser UI is not part of
the world target set. Within the world, the nearest eligible visible hit wins;
ties use stable Browser scene order. A child hit resolves to its closest
declared interactive ancestor. Hidden, inactive, unloaded, or capability-denied
targets are ineligible.

## 3. Capabilities and permission checks

Target affordances declare what a package understands. P2 capability grants
decide what Browser-owned facilities the package may request. Declaration and
grant remain separate.

Capability lifecycle is explicit:

- `request`: the package uses the canonical 0002 manifest shape. A request
  conveys no authority and cannot cause input capture or a permission prompt.
- `grant`: P2 may issue a package- and instance-scoped grant after Browser
  policy and any user consent. Operations still undergo target, focus, current
  owner, and runtime validation.
- `revoke`: the Browser may revoke a grant on user action, policy change, focus
  loss, world unload, navigation, worker crash, teardown, or timeout.
- `cleanup`: revocation cancels affected interactions, releases capture and
  temporary locks, clears focus where required, stops delivery, and is
  idempotent.

Launch capability names:

| Capability | Launch meaning |
|---|---|
| `webspace.input.pointer-lock` | Package may request that the Browser offer pointer-lock entry from a user gesture. It cannot call the web API itself. |
| `webspace.input.keyboard-lock` | Recognized but **never granted in the launch profile**. Optional requests degrade; required requests reject during P2 negotiation. |
| `webspace.input.text-edit` | Package may request focus for a declared plain-text target and receive Browser-mediated edit snapshots. |
| `webspace.input.clipboard-write` | Package may request a user-triggered plain-text copy/cut operation for its focused editor. |

Ordinary declared `point`, `activate`, `grab`, `drag`, `release`, and `cancel`
delivery needs no sensitive device grant; it is already bounded to a visible
target and mediated by the Browser. Text focus and device locks cross stronger
boundaries and require the capabilities above.

Paste does not grant clipboard read access. The Browser accepts only the
plain-text payload supplied by a trusted native paste event while the target is
focused. A package never receives a clipboard handle, MIME list, or background
read primitive.

## 4. Versioned package-boundary protocol

All P3 messages use one bidirectional, discriminated envelope across the
package isolation boundary:

```js
{
  version: "webspace-input-v0",
  kind: "interaction",
  sequence: 42,
  targetId: "stable-package-local-id",
  requestId: null,
  payload: {}
}
```

`kind` completely determines the direction and payload:

| Kind | Direction | Payload |
|---|---|---|
| `target` | package -> Browser | `{ operation: "register" | "update" | "remove", declaration }`; carries a `requestId`, `declaration` uses section 2, and declaration is absent for `remove` |
| `request` | package -> Browser | `{ operation, parameters }` for `focus-text`, `blur-text`, `pointer-lock`, `clipboard-write`, or another capability-defined Browser operation |
| `interaction` | Browser -> package | `{ action, phase, source, coordinates, controls, modifiers, reason }` where `action` is exactly one of the six section 2 actions |
| `focus` | Browser -> package | `{ state: "focus" | "blur", reason }` |
| `edit` | Browser -> package | `{ state: "update" | "commit" | "cancel", value, selectionStart, selectionEnd, selectionDirection, composing, compositionPhase, inputType, reason }` |
| `result` | Browser -> package | `{ operation, status, grantId, reason, expiresAt }` correlated to one `requestId` |

The common fields have one meaning:

- `version` is exactly `webspace-input-v0`. An unknown version is rejected
  before inspecting its payload.
- `sequence` is a positive, monotonically increasing integer per sender and
  package instance. The Browser and package maintain independent sequences.
  The ordered isolation channel preserves send order. Gaps are allowed and
  development-logged. Duplicate precedence is defined in section 4.3; the
  simple "discard at or below the last accepted sequence" rule applies to
  Browser-to-package messages, not before package-request idempotency lookup.
- `targetId` is required for `target`, `interaction`, `focus`, and `edit`.
  For `request` and `result`, its required/null scope is operation-specific
  (section 4.2).
- `requestId` is a package-generated, instance-unique string on `target` or
  `request` and the correlated `result`; it is `null` for other kinds. Its
  canonical form is `r:<ordinal>:<nonce>`, where `ordinal` is a positive,
  monotonically increasing integer per package instance and `nonce` is a
  bounded opaque token. Reusing a completed id follows section 4.3. Bounded
  pending and retained-result windows prevent exhaustion.
- `payload` must contain only fields allowed for its `kind`; sizes, strings,
  finite numbers, enum values, target lifetime, current grant, and current
  owner are validated before state changes or delivery.

### 4.1 Interaction payload

For `kind: "interaction"`:

- `action` is `point`, `activate`, `grab`, `drag`, `release`, or `cancel`.
- `phase` is `start`, `update`, or `end`. `activate`, `release`, and `cancel`
  use `end`; `point` normally uses `update`; `grab` starts a direct
  manipulation; `drag` updates a captured pointer or direct manipulation.
- `source.kind` is `pointer`, `touch`, `gamepad`, `xr-ray`, `xr-direct`,
  `keyboard`, or `accessibility`. Raw device ids and raw `Gamepad` objects are
  not exposed.
- `coordinates` is absent for `none`, `{ kind: "surface-uv", x, y }` with
  `x/y` clamped to `[0, 1]`, or bounded local manipulation coordinates defined
  in section 9.
- `controls` contains only normalized axes in `[-1, 1]` and declared semantic
  button names. It never contains raw device arrays.
- `modifiers` contains applicable `alt`, `control`, `meta`, and `shift`
  booleans.
- `reason` is non-null only for `cancel`, using section 16 codes.

### 4.2 Focus, edit, request, and result lifecycle

Focus changes are delivered as `kind: "focus"` after Browser arbitration. On
focus loss, the Browser first sends any final `edit` `commit` or `cancel`, then
an interaction `cancel` when one is active, then `focus { state: "blur" }`.
No edit follows that blur unless a later focus is granted.

An `edit` `update` is a complete Browser-owned snapshot, not a patch. A
composition uses `compositionPhase: "start" | "update" | "end"`; the one
committed post-composition snapshot uses `state: "commit"`,
`compositionPhase: "end"`, and `composing: false`. Cancellation uses
`state: "cancel"` and never invents committed text.

Every package `target` mutation or `request` receives exactly one initial
`result` unless package teardown destroys the channel first. `status` uses the
normative result-status enum in section 16; `reason` uses the separate reason
enum there. `grantId` and `expiresAt` are present only when a scoped lease is
granted. A granted,
still-live request may later receive one revocation `result` with the original
`requestId`, `status: "interrupted"`, and reason `revoked`, followed by required
cleanup messages in the ordering above. That revocation replaces the current
result returned for later idempotent reuse.

Request scope is normative:

| Operation | `targetId` |
|---|---|
| `focus-text` | required; identifies the declared `textEditable` target to focus |
| `blur-text` | required; must equal the currently focused text target |
| `clipboard-write` | required; identifies the focused target whose selected plain text is copied/cut |
| `pointer-lock` | must be `null`; this is a package-instance request initiated through trusted Browser UI, not authority over a target |
| `target` register/update/remove | required in the envelope and must equal the declaration/removal id |
| future capability operation | its defining proposal must say `required` or `null`; an unspecified scope is `invalid` |

A `result` echoes the request's `targetId`, including `null` for
`pointer-lock`. A target-scoped request with `null`, an instance-scoped request
with a target, or a mismatched target is `status: "invalid"`, reason
`invalid-target`.

`target` registration must succeed before that target can receive focus or
interaction. Invalid package-to-Browser messages receive an `invalid` result
when they carry a usable `requestId`; otherwise they are dropped and
development-logged. Unknown fields are ignored only when the v0 kind explicitly
permits extensions; otherwise they fail validation. Browser teardown stops all
delivery after completing best-effort cancel/blur messages and does not wait
for package acknowledgement.

### 4.3 Duplicate, replay, and idempotency precedence

For incoming package `target` and `request` messages, idempotency lookup
**precedes** ordinary sequence rejection:

1. The Browser minimally validates `version`, `kind`, `sequence`, `requestId`
   syntax/ordinal, `targetId`, operation name, and bounded payload encoding
   without performing the operation. It computes a canonical fingerprint over
   `kind`, `targetId`, operation, and normalized declaration/parameters.
2. If `requestId` is present in the retained-result window and the fingerprint
   is identical, the Browser returns the cached **current** `result` even when
   the message repeats the original sequence. It does not perform the operation
   again and does not advance the accepted package sequence. The returned
   result carries a fresh Browser sequence so package-side duplicate filtering
   cannot discard a response to a legitimate retransmission.
3. If that known `requestId` has a different kind, target, operation, or
   normalized declaration/parameters, the Browser returns `status: "invalid"`,
   reason `request-id-conflict`. It performs neither the old nor new operation
   and does not replace the cached result.
4. If the id is unknown but its request ordinal is at or below the retained
   window's low-water mark, or its sequence is at or below the last accepted
   package sequence, the Browser returns `status: "invalid"`, reason
   `expired-request`. It never repeats an operation whose cache record may have
   expired.
5. Only an unknown id with a new ordinal and a sequence above the last accepted
   package sequence can proceed to full validation and operation. The Browser
   stores its canonical fingerprint and result in the bounded window. Invalid
   new requests also consume their ordinal/sequence and cache the invalid
   result, preventing retry side effects.

The retained-result window is bounded by Browser policy in count and time and
publishes neither limit to package code as authority. The Browser retains the
ordinal low-water mark after result eviction for the package instance's
lifetime, so an evicted id remains detectably expired.

For Browser-to-package `interaction`, `focus`, `edit`, and `result` messages,
the package discards a sequence at or below the last accepted Browser sequence.
Those messages never trigger an operation merely by being received twice. A
sequence gap is allowed and may prompt diagnostics or application recovery, but
does not relax duplicate handling.

## 5. Shared activation lifecycle

Every primary activation source—mouse, touch, keyboard, gamepad, XR ray, or an
accessibility activation command—uses the same Browser-owned state machine:

1. **Press:** a non-repeat press records the eligible target, source owner,
   target lifetime, coordinates, and grants in a pressed record. It does not
   emit `activate`.
2. **Hold:** movement may transition an eligible target to drag; focus and
   ownership remain with the pressed record. Repeated DOM keydown or gamepad
   polling samples do not create another press.
3. **Release:** release emits exactly one `activate` only if the original target
   still exists, remains eligible and visible, retains required grants and
   ownership, and the source has neither dragged nor been cancelled. Otherwise
   it emits `cancel`. A release is never retargeted to the object currently
   under the pointer/ray.
4. **Interrupt:** disconnect, pointer/touch cancellation, tracking loss, focus
   or visibility loss, target removal, ownership preemption, grant revocation,
   world pause/unload, worker failure, navigation, or trusted UI takeover emits
   `cancel` and clears the pressed record. A later physical release is ignored.

For keyboard and accessibility activation, the pressed target is the currently
focused eligible target. An accessibility platform command is normalized as
one synthetic press/release pair; Browser arbitration still occurs between the
two transitions.

`activationRepeat: "none"` ignores hardware/DOM repeat and polling duplicates.
For `while-held`, after the Browser's accessible repeat delay, each Browser
timer tick revalidates the original pressed target and may emit one `activate`;
device repeat events themselves remain ignored. Once any held repeat fires,
physical release only closes the record and does not emit an extra activation.
The delay/rate is Browser/user preference and applies identically regardless of
the physical source.

## 6. Mouse and pointer mapping

For an unlocked fine pointer, movement performs `point`; primary
`pointerdown` enters section 5 Press and records the eligible target.
If movement crosses four CSS pixels, an eligible draggable target transitions
to `drag`. `pointerup` runs section 5 Release: it produces `activate` only
after revalidating the original pressed target, or `release` if a drag is
active. `pointercancel`, lost capture, target removal, or focus loss runs
Interrupt and produces `cancel`.

Under pointer lock, the world ray is the Browser-owned view-center ray. Relative
mouse motion remains look input unless a captured drag's temporary drag lock is
active. Primary down records the center-ray target and primary up performs the
same revalidated Release as an unlocked pointer. The Browser may
render its own cursor or reticle; a world supplies only the advisory target
cursor.

Compatibility mouse events generated after Pointer Events are suppressed for
the same physical action. Secondary/context behavior remains Browser policy
unless a future capability explicitly grants a bounded secondary action.

## 7. Touch mapping

A touch begins on exactly one owner: trusted Browser UI, a world target, or the
Browser's movement/look controls. Its identifier remains with that owner until
release or cancellation; moving across another surface does not transfer it.

- `touchstart` on an eligible target records the section 5 pressed target. A
  touch that remains within eight CSS pixels and 500 milliseconds remains an
  activation candidate; `touchend` activates only after revalidating that
  original target.
- Movement beyond the threshold maps to `drag` only when the starting target
  declared it. Otherwise the original owner retains or cancels the touch
  according to its control.
- `touchend` produces `release` for an active drag.
- `touchcancel`, page gesture takeover, visibility loss, or target removal
  interrupts the pressed record and produces `cancel`; a later `touchend` is
  ignored.

Multiple touches may independently operate Browser movement/look controls.
Launch world-object interaction is single-primary-touch: an additional touch
cannot steal focus or capture and is ignored or retained by Browser UI.
Browser/OS accessibility and navigation gestures outrank world interaction.

## 8. Controller and gamepad mapping

The Browser selects one active flat-screen gamepad after an explicit input from
that device; connection alone does not enter play or steal ownership. Dead
zones, repeat timing, layout normalization, and disconnect cleanup are Browser
policy exposed through semantic actions:

- reticle/look axes update `point`;
- primary/A down records the eligible reticle or focused target; primary/A up
  runs section 5 Release and activates only if that same target remains valid;
- grip/bumper starts `grab` on an eligible target;
- axes update `drag` while that target is held;
- button-up produces `release`;
- Back/B, device disconnect, focus/ownership loss, or trusted UI takeover
  produces `cancel` and suppresses the later button-up;
- Start/Menu opens trusted Browser UI and preempts world input.

Gamepad polling while A remains down does not repeat Press. Held activation
repeats only through the target's section 5 `activationRepeat` policy.
Device-specific labels may be shown by trusted Browser UI but are not added to
package events.

## 9. XR mapping

An XR controller's target ray performs `point`. Trigger down records the
eligible ray target; trigger up activates only after revalidating that original
target through section 5. Trigger movement while captured maps to `drag`;
trigger release maps to `release` for a drag. Tracking or ownership loss before
release maps to `cancel`, and the later trigger-up is ignored.

Grip on a target inside Browser-defined reach emits `grab` with phase `start`.
Every accepted direct-manipulation update then uses `kind: "interaction"`,
`action: "drag"`, `phase: "update"`, and `source.kind: "xr-direct"`.
`coordinates` is `{ kind: "local-meters", position: [x, y, z], orientation:
[x, y, z, w] }` in the target's declared manipulation frame: position
components are finite and clamped to the target's declared local interaction
bounds, and orientation is a finite normalized quaternion. Optional `controls`
contains at most four normalized axes in `[-1, 1]` and declared semantic
buttons such as `primary` or `grip`; it never contains the raw controller pose
or `Gamepad`. Grip-up emits `release`. Tracking loss, input-source replacement,
controller disconnect, reference-space reset that invalidates the target, or
XR session end emits `cancel`.

Ray activation and direct grab are distinct owners per hand. A single hand
cannot own both simultaneously. Trusted XR Browser UI and the session-exit
gesture outrank both. Hand tracking, gaze dwell, and arbitrary gestures are
deferred.

## 10. Focus and keyboard routing

The Browser owns one focused world target per browsing context. Focus is
granted only after an eligible user interaction or keyboard traversal and only
to a target declaring `focusable`. Focus does not imply pointer capture, text
editing, or a device-lock grant.

Keyboard routing precedence is:

1. universal Browser escape and trusted shortcuts;
2. native Browser text editing and IME for the focused text bridge;
3. focused world-target semantic keys;
4. captured/held placed-content controls;
5. locomotion and look controls.

Tab participates in Browser-owned focus traversal and can always reach trusted
Browser UI. A package can suggest target order within its instance using stable
integer order values, but cannot trap traversal. Enter/Space keydown records
the currently focused eligible target; keyup activates only if that original
target remains focused and valid. Repeated keydown events never create
duplicate activation and are ignored unless the Browser timer is applying the
target's section 5 `while-held` policy. Focus or ownership loss before keyup
emits `cancel`, and the later keyup is ignored. Accessibility activation uses
the same synthetic Press/Release pair. Text repeat remains native editing
behavior.

Focus and blur use the versioned `kind: "focus"` messages from section 4 rather
than overloading the six actions. Blur first sends the final edit
commit/cancel, cancels active interaction, and then releases focus-bound
leases. World pause, unload, navigation, worker failure, and target removal
force the same ordered cleanup.

## 11. Pointer lock and keyboard lock

`webspace.input.pointer-lock` authorizes only a `kind: "request"` to the Browser. The
Browser may present or combine that request with a trusted Play control. Actual
acquisition requires a fresh user gesture and user-agent approval. A denied,
unsupported, or interrupted request returns the correlated section 4
`kind: "result"` with status `denied`, `unsupported`, or `interrupted`; the
Browser retains unlocked point/activate controls and does not retry without
another gesture.

Escape, trusted menu activation, navigation, focus transfer to editable UI,
visibility loss, or world teardown releases pointer lock and cancels affected
interactions. A package cannot hide the unlocked state or consume Escape.
Pointer-lock continuity is never promised across navigation or origins.

`webspace.input.keyboard-lock` is recognized so packages can fail or degrade
predictably, but the launch profile denies it. The Browser does not call
`navigator.keyboard.lock()`. A future profile must define allowed codes,
fullscreen coupling, visible trusted indication, denial fallback, and
guaranteed unlock before enabling it.

## 12. Dragging, grabbing, capture, and cancellation

Pointer capture has one Browser-owned interaction record:

```text
idle -> pressed -> dragging -> released -> idle
             \          \-> cancelled -> idle
              \------------> activated -> idle
```

The record contains instance, target, source, pointer/hand id, start
coordinates, last bounded coordinates, grant ids, and cleanup state. It does not
cross into multiplayer authority.

When a declared drag crosses the device threshold, the Browser establishes a
**temporary drag lock**. This lock suppresses movement controls and, for a
pointer-locked surface drag, look deltas while preserving universal Escape and
trusted Browser UI. It belongs to the capture record, cannot outlive it, cannot
be renewed by package code, and is not a manifest capability.

`pointerup`, button/grip up, or semantic `release` ends the drag and clears
capture plus the temporary drag lock. `pointercancel`, semantic `cancel`, lost
capture, device disconnect, focus/visibility loss, target removal, package
pause/unload, worker crash, navigation, or capability revocation clears both
through the same idempotent cancel path.

Grab acquisition uses Browser-local pose and declared target volumes, with a
larger release radius permitted to prevent jitter. It emits a target id and
bounded semantic controls, not raw poses. XR direct manipulation is precisely
the `grab` start followed by `drag` updates with bounded `local-meters`
position, normalized orientation, axes, and semantic buttons defined in section
9. Contested or authoritative ownership is resolved by the world
simulation/authority after receiving intent; local capture never proves
ownership.

## 13. Text selection, clipboard, and composition

Text editing uses a Browser-owned native control associated with one declared
`textEditable` target and a granted `webspace.input.text-edit` capability. The
package receives bounded `kind: "edit"` snapshots:

```js
{
  value: "plain text",
  selectionStart: 3,
  selectionEnd: 7,
  selectionDirection: "forward",
  composing: false,
  inputType: "insertText"
}
```

The Browser defines a package/world-policy maximum length, clamps selection to
valid UTF-16 boundaries accepted by the native control, and never lets a
package mutate the hidden/native control directly. Selection changes caused by
keyboard, pointer drag, touch handles, or accessibility APIs produce the same
snapshot. Worlds render selection presentation but do not maintain an
independent editing truth.

Composition is explicit:

1. `compositionstart` sets `composing: true`; the current value is provisional.
2. `compositionupdate` may update the provisional value and selection.
3. `compositionend` commits once and sets `composing: false`.

Packages must not submit chat, activate an editor, or replicate intermediate
composition as committed text. Enter during composition is owned by the native
IME. Blur, cancellation, target removal, or teardown ends the native
composition according to user-agent behavior, emits one final snapshot if
committed, and otherwise reports `cancel` without inventing text.

Clipboard behavior is narrow:

- paste accepts only `text/plain` from a trusted native paste event while the
  editor is focused; denial or unavailable clipboard data leaves the value
  unchanged and reports `status: "denied"` with reason `user-denied` or
  `policy-denied`, or `status: "unsupported"` with reason `unsupported-api`;
- copy/cut requires a user gesture and `webspace.input.clipboard-write`; the
  Browser supplies only the selected plain text to the platform operation;
- background reads, polling, arbitrary MIME types, files, images, and silent
  writes are not exposed.

## 14. Ownership, precedence, and arbitration

The complete precedence order is:

```text
universal escape / trusted Browser UI
  > native text editing and IME
  > captured world interaction
  > focused world interaction
  > captured or held placed content
  > movement controls and look controls
```

Browser UI outranks world interactions at all times. A world interaction
preempts movement controls only while its focus, capture, text session, or
temporary drag lock is active. Movement controls resume only after the previous
owner's release/cancel cleanup completes; the same physical sample is not
replayed into locomotion.

Ownership is per physical source. Two sources may operate concurrently only
when their owners do not conflict—for example, a left touch movement stick and
a right touch look stick. One pointer/hand cannot be reassigned mid-stream.
Opening Browser UI cancels or pauses conflicting world interactions before UI
receives input. Closing UI never synthesizes the swallowed action.

Packages cannot arbitrate globally. They receive only events for targets they
own after Browser arbitration. Inactive worlds and unfocused object instances
receive no local input.

## 15. Browser UI, accessibility, and universal escape

Trusted Browser UI must remain reachable by pointer, touch, keyboard, gamepad,
and XR. It renders above world content, owns its listeners, and is never
represented as a package target. A world cannot suppress its focus ring,
permission indication, lock state, exit control, or error recovery.

Escape is universal on keyboards. Equivalent trusted menu/back controls apply
to touch, gamepad, and XR. The first escape action releases the most specific
captured/locked interaction and exposes trusted UI; repeated escape follows
ordinary Browser/user-agent behavior. It is never delivered solely to a world.

Browsers provide keyboard-only focus and activation, visible focus/reticle
state, reduced-motion-compatible feedback, and non-lock fallbacks. Semantic
actions do not require a particular device, and packages must not infer
disability or device identity from the normalized source.

## 16. Failure, denial, fallback, and release behavior

Failures are local to the affected request or interaction unless P2 says a
required capability denial prevents package startup.

`result.status` has this normative enum:

| Status | Meaning |
|---|---|
| `granted` | the operation completed or its scoped lease became active |
| `denied` | the operation was understood but policy, the user, arbitration, or a bounded resource limit refused it |
| `unsupported` | the requested trusted API, device, or mode is unavailable |
| `interrupted` | a previously accepted or granted operation ended because its authority, owner, target, device, or lifecycle precondition was lost |
| `invalid` | the request cannot be considered or repeated safely because its envelope, scope, target, idempotency identity, or payload is invalid or expired |

`result.reason` is `null` for `granted`. For every other status it is one of
this separate normative enum:

| Reason | Compatible status | Meaning and required Browser behavior |
|---|---|---|
| `policy-denied` | `denied` | world, package-grant, or Browser policy refused the operation; retain the safe fallback |
| `user-denied` | `denied` | the user refused or did not complete the trusted prompt/gesture; retain the safe fallback |
| `conflict` | `denied` | a higher-priority owner already holds the source; do not steal it |
| `rate-limited` | `denied` | a bounded pending, event-rate, or resource limit was reached; do not queue unbounded work |
| `unsupported-api` | `unsupported` | the API, device, or mode is unavailable; retain supported semantic mappings |
| `revoked` | `interrupted` | the capability grant was revoked; cancel and release every state derived from it |
| `focus-lost` | `interrupted` | document, world, target, or text focus was lost; cancel and release affected state |
| `visibility-lost` | `interrupted` | the document or world ceased to be visible; cancel and release affected state |
| `device-disconnected` | `interrupted` | the input device disconnected; cancel its held records |
| `tracking-lost` | `interrupted` | XR tracking or session ownership was lost; cancel its held records |
| `target-removed` | `interrupted` | the active target was removed or became inactive; cancel its records |
| `instance-gone` | `interrupted` | the package paused, unloaded, or crashed; stop delivery and perform lifecycle cleanup |
| `navigation` | `interrupted` | navigation replaced the world or package instance; perform teardown cleanup |
| `teardown` | `interrupted` | explicit teardown ended the instance; perform teardown cleanup |
| `request-id-conflict` | `invalid` | a retained `requestId` was reused for a different fingerprint; perform neither operation |
| `expired-request` | `invalid` | an unknown/stale request is outside the idempotency window or repeats an accepted sequence; never repeat the operation |
| `invalid-target` | `invalid` | the target is missing, inactive, mismatched, wrongly scoped, or lacks the requested action |
| `invalid-message` | `invalid` | version, envelope, finite-number, size, enum, or payload validation failed; development-log bounded detail |

World unload, teardown, worker crash, navigation, visibility loss, document blur,
XR session end, device disconnect, target removal, and grant revocation all
converge on the same cancel-and-release primitive. It is safe to call more than
once and completes even if the package boundary no longer responds.

The Browser never silently falls back from an unavailable trusted mechanism to
more privilege. Pointer-lock denial falls back to unlocked interaction;
Keyboard Lock remains denied; clipboard denial leaves text unchanged; XR
failure retains flat-screen entry; and focus failure leaves locomotion
available without delivering text to the world.

## 17. Implementation reconciliation

The reference Browser already implements parts of this contract:

- `client/js/main.js` owns hit testing, normalized worker interaction messages,
  focus, pointer capture, drag projection, text bridge state, world
  movement/look locks, pointer-lock entry, XR ray interaction, and cleanup.
- `client/js/InputHandler.js` owns keyboard movement, pointer-lock mouse look,
  touch state, XR gamepads, and routed-hand suppression.
- `client/js/TouchControls.js` owns touch HUD controls, device entry policy,
  fullscreen/orientation behavior, and touch cancellation.
- `client/js/GamepadControls.js` and `client/js/utils/Gamepad.js` contain
  flat-screen gamepad polling/normalization that is not yet integrated into one
  versioned semantic map.
- `client/js/GrabbableInput.js` already projects local pose/volume data into
  semantic target ids with acquire/release hysteresis.
- `client/js/ContentNavigator/InputRouter.js` already routes per-hand grab
  payloads and suppresses the corresponding global control path.
- `client/js/ContentNavigator/ExternalScene.js` already forwards Browser-owned
  normalized interactions across the worker boundary.
- `client/js/EmbeddedClientApi.test.mjs` source-checks several pointer capture,
  cancellation, focus, text, and lock seams.

Contradictions and gaps:

- `webspaceInteractive`, `webspacePointerCapture`, and `hostControl` messages are
  unversioned implementation flags, not target/capability schemas.
- movement/look lock requests are ungranted string-keyed sets without leases,
  owner lifetime, timeout, or one cleanup primitive;
- Keyboard Lock, Clipboard API/event policy, `beforeinput`, and explicit IME
  composition handling are absent;
- flat-screen gamepad input and XR/gamepad serialization overlap without one
  active-source policy;
- the hidden textarea forwards snapshots but lacks version, size, direction,
  composition, and typed-failure semantics;
- `docs/embeddable-client-api.md` describes older cursor-free behavior and calls
  a world-object input extension missing even though current code contains one;
- `client/js/GrabbableInput.test.mjs` and `client/js/InputRouting.test.mjs`
  currently stop on test-harness drift, so they cannot support R3 verification
  until repaired.

These gaps belong to R3 implementation. This proposal does not rewrite those
files.

## 18. Acceptance tests

R3 conformance requires behavioral tests, not only source-pattern assertions.

Device matrix:

- **desktop mouse/keyboard:** unlocked and pointer-locked point/activate,
  threshold drag, temporary drag lock, Escape, Tab traversal, and lock denial;
- **touch:** tap, threshold drag, multi-touch HUD/world ownership,
  `touchcancel`, virtual keyboard open/dismiss, and OS gesture preemption;
- **gamepad:** active-controller selection, dead zones, activation/grab/release,
  trusted Menu priority, disconnect cancellation, and no auto-entry on connect;
- **WebXR:** controller ray activation, direct grab, per-hand conflict, tracking
  loss, input-source replacement, session-end cancellation, and trusted exit.

Cross-cutting tests:

- every physical mapping produces the same normalized semantic action and
  bounded coordinate shape;
- each of `point`, `activate`, `grab`, `drag`, `release`, and `cancel` is
  independently observable;
- Browser UI, native editing, world interactions, placed content, and movement
  controls obey the section 14 ordering with no duplicate delivery;
- temporary drag lock starts only after threshold and always clears on release,
  cancel, blur, visibility loss, target removal, crash, unload, and navigation;
- capability request/grant/deny/revoke/cleanup stops the gated operation and
  clears its leases;
- selection direction and bounds survive keyboard, pointer, and touch editing;
- clipboard paste denial/unavailability and copy/cut grant failure do not mutate
  text unexpectedly;
- IME tests cover `compositionstart`, multiple updates, `compositionend` commit,
  Enter during composition, blur cancel/commit, and no intermediate chat send;
- malformed envelopes, non-finite/out-of-range coordinates, duplicate sequence,
  inactive targets, and unknown versions fail closed;
- boundary tests cover every `target`, `request`, `interaction`, `focus`,
  `edit`, and `result` direction, schema, ordering rule, correlation,
  duplicate/replay case, lifecycle cleanup, and teardown race;
- mouse, touch, keyboard, gamepad, XR-ray, and accessibility activation each
  prove Press records the original target, Release revalidates it, interruption
  cancels it, and repeat never duplicates activation unless `while-held`;
- XR direct grab proves `grab` start, bounded `local-meters` `drag` updates,
  normalized axes/buttons, and release/cancel without raw pose leakage;
- keyboard-only and reduced-motion paths retain visible focus and trusted exit.

At least one real-browser automated test is required for Pointer Lock/focus,
touch/visual viewport text, clipboard denial, and composition because DOM stubs
cannot prove user-agent permission or editing behavior. XR may use an emulator
plus one named-device smoke test.

## 19. Migration notes

R3 should migrate in bounded steps:

1. Add a Browser-internal semantic event and owner/cancel model while adapting
   existing `webspaceInteractive`, `webspacePointerCapture`, and
   `ExternalScene.SendInteraction` behavior.
2. Replace independent movement/look lock sets with Browser-owned scoped leases
   and the temporary drag lock. Keep legacy `hostControl` messages behind an
   adapter that cannot exceed the new capability grant.
3. Version the hidden text bridge, add `beforeinput`, selection direction,
   composition lifecycle, length policy, and typed failures before changing
   world chat consumers.
4. Normalize flat-screen gamepad and XR mappings into the same action layer;
   retain `getHeldKey`, `isActionKeyHeld`, synthetic controller snapshots, and
   raw worker fields only as compatibility surfaces with warnings.
5. Update `docs/embeddable-client-api.md` and
   `docs/external-content-contract.md`; document one overlap release, then
   remove accidental raw-event/gamepad surfaces in a separately announced
   version.

Embedders using `input.pointerLockOnCanvasClick` retain that Browser option. It
selects Browser policy; it does not become a world grant. Existing packages
continue through the compatibility adapter until the announced removal
version. No silent semantic change is permitted inside the same contract
version.

## 20. Deferred work and non-goals

Deferred beyond the launch profile:

- granting `webspace.input.keyboard-lock`;
- rich clipboard MIME types, files, images, background reads, and arbitrary
  programmatic writes;
- hand tracking, gaze dwell, voice input, custom gestures, haptics, and spatial
  accessibility APIs;
- a user-facing global remapping/profile system;
- general multi-pointer world-object gestures;
- authoritative multiplayer ownership, conflict resolution, physics, and
  rollback semantics;
- stable wire serialization of interaction events between peers or servers;
- delegated input capabilities from a world to child packages;
- arbitrary package-defined global shortcuts or suppression of Browser/OS
  commands.

These deferrals do not weaken Browser ownership, cleanup, universal escape, or
the six semantic launch actions.

## 21. Security and privacy analysis

- A malicious target cannot capture off-target input unless the Browser has an
  active record created by an eligible user interaction.
- Capture, focus, locks, and text sessions are scoped to instance and target,
  time-bounded by ownership, revocable, and forcibly cleaned on lifecycle loss.
- Raw rays, poses, device ids, keyboard layouts, clipboard handles, and
  composition internals are minimized or withheld.
- Pointer/Keyboard Lock, fullscreen, XR, and clipboard remain subject to web
  user-gesture and permission rules; package capability grants cannot bypass
  them.
- Trusted UI and universal exit cannot be covered, consumed, or disabled by
  package code.
- Coordinates, text, selection, action lists, ids, and event sizes are bounded
  and validated before crossing isolation.
- Local grab/capture is never accepted as shared-state authority. A dedicated
  server validates any resulting approved interaction separately.
- Sequence values prevent accidental local duplicate handling but are not
  replay protection for networking.

## 22. Decision summary

The launch profile adopts:

- six device-independent actions: `point`, `activate`, `grab`, `drag`,
  `release`, and `cancel`;
- Browser-owned target eligibility, focus, source ownership, capture,
  precedence, temporary drag lock, cleanup, and trusted escape;
- capability-mediated pointer-lock and text/clipboard operations using P2;
- denied Keyboard Lock at launch;
- native Browser text editing as truth, including selection and IME composition;
- semantic local intent only, with simulation/authority ownership outside P3;
- compatibility adapters and focused R3 migration rather than an input rewrite.

This is sufficient to make R3 an implementation/verification task without
expanding the launch into a general input framework.
