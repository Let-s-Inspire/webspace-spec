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
[P3 implementation inventory](https://github.com/Let-s-Inspire/webspace-browser/blob/docs/p3-interaction-input-contract-inventory/docs/p3-interaction-input-design-inventory-2026-07-26.md).

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
  coordinateSpace: "surface-uv",
  cursor: "pointer",
  hands: ["left", "right"]
}
```

- `id` is unique within the package instance and stable for the target's
  lifetime. The Browser qualifies it with the instance id.
- `actions` is an allow-list. Undeclared actions are not delivered.
- `focusable` and `textEditable` are affordances, not grants.
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

## 4. Interaction event contract

The Browser sends one normalized envelope across the package isolation
boundary:

```js
{
  version: "webspace-interaction-v0",
  sequence: 42,
  targetId: "stable-package-local-id",
  action: "point",
  phase: "update",
  source: { kind: "pointer", pointerType: "mouse", hand: null },
  coordinates: { kind: "surface-uv", x: 0.25, y: 0.75 },
  buttons: ["primary"],
  modifiers: { alt: false, control: false, meta: false, shift: false },
  edit: null,
  reason: null
}
```

- `sequence` is monotonically increasing per package instance. It provides
  ordering and duplicate detection inside that instance; it is not a network
  sequence or authority proof.
- `phase` is `start`, `update`, or `end`. `activate` is an `end` event.
- `source.kind` is `pointer`, `touch`, `gamepad`, `xr-ray`, `xr-direct`, or
  `keyboard`. Raw device ids and raw `Gamepad` objects are not exposed.
- `coordinates` is absent when the target declared `none`; otherwise it uses
  the declared, bounded coordinate space.
- `buttons` contains semantic names such as `primary`, `secondary`, or `grip`,
  not browser-specific numeric layouts.
- modifiers are present only for applicable local input.
- `edit` is present only for text-edit events defined in section 12.
- `reason` is present on `cancel` and failures, using section 15 codes.

Unknown fields are ignored within v0. Unknown versions or actions fail closed
for that event and surface a development diagnostic without tearing down the
world.

## 5. Mouse and pointer mapping

For an unlocked fine pointer, movement performs `point`; primary
`pointerdown` starts a possible activation and establishes the pressed target.
If movement crosses four CSS pixels, an eligible draggable target transitions
to `drag`. `pointerup` on the valid pressed target produces `activate` if no
drag began, or `release` if a drag is active. `pointercancel`, lost capture,
target removal, or focus loss produces `cancel`.

Under pointer lock, the world ray is the Browser-owned view-center ray. Relative
mouse motion remains look input unless a captured drag's temporary drag lock is
active. A primary press can activate the center-ray target. The Browser may
render its own cursor or reticle; a world supplies only the advisory target
cursor.

Compatibility mouse events generated after Pointer Events are suppressed for
the same physical action. Secondary/context behavior remains Browser policy
unless a future capability explicitly grants a bounded secondary action.

## 6. Touch mapping

A touch begins on exactly one owner: trusted Browser UI, a world target, or the
Browser's movement/look controls. Its identifier remains with that owner until
release or cancellation; moving across another surface does not transfer it.

- A tap that remains within eight CSS pixels and 500 milliseconds maps to
  `point` then `activate`.
- Movement beyond the threshold maps to `drag` only when the starting target
  declared it. Otherwise the original owner retains or cancels the touch
  according to its control.
- `touchend` produces `release` for an active drag.
- `touchcancel`, page gesture takeover, visibility loss, or target removal
  produces `cancel`.

Multiple touches may independently operate Browser movement/look controls.
Launch world-object interaction is single-primary-touch: an additional touch
cannot steal focus or capture and is ignored or retained by Browser UI.
Browser/OS accessibility and navigation gestures outrank world interaction.

## 7. Controller and gamepad mapping

The Browser selects one active flat-screen gamepad after an explicit input from
that device; connection alone does not enter play or steal ownership. Dead
zones, repeat timing, layout normalization, and disconnect cleanup are Browser
policy exposed through semantic actions:

- reticle/look axes update `point`;
- primary/A produces `activate`;
- grip/bumper starts `grab` on an eligible target;
- axes update `drag` while that target is held;
- button-up produces `release`;
- Back/B or device disconnect produces `cancel`;
- Start/Menu opens trusted Browser UI and preempts world input.

Keyboard-only activation maps focus traversal plus Enter/Space to the same
`point` and `activate` semantics. Device-specific labels may be shown by trusted
Browser UI but are not added to package events.

## 8. XR mapping

An XR controller's target ray performs `point`. Trigger down/up maps to the same
pressed-target and `activate` rules as a primary pointer. Trigger movement while
captured maps to `drag`; trigger release maps to `release`.

Grip on a target inside Browser-defined reach starts `grab`; pose changes are
converted to bounded semantic manipulation input or a package-declared local
coordinate payload. Grip-up produces `release`. Tracking loss, input-source
replacement, controller disconnect, reference-space reset that invalidates the
target, or XR session end produces `cancel`.

Ray activation and direct grab are distinct owners per hand. A single hand
cannot own both simultaneously. Trusted XR Browser UI and the session-exit
gesture outrank both. Hand tracking, gaze dwell, and arbitrary gestures are
deferred.

## 9. Focus and keyboard routing

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
integer order values, but cannot trap traversal. Enter/Space activates the
focused target. Key repeat is delivered only for actions that declare repeat;
text repeat remains native editing behavior.

Focus emits `focus` and `blur` lifecycle notifications outside the six action
set. Blur first cancels active interaction and composition state, then releases
focus-bound leases. World pause, unload, navigation, worker failure, and target
removal force the same cleanup.

## 10. Pointer lock and keyboard lock

`webspace.input.pointer-lock` authorizes only a request to the Browser. The
Browser may present or combine that request with a trusted Play control. Actual
acquisition requires a fresh user gesture and user-agent approval. A denied,
unsupported, or interrupted request returns `not-granted`,
`unsupported`, or `interrupted`; the Browser retains unlocked point/activate
controls and does not retry without another gesture.

Escape, trusted menu activation, navigation, focus transfer to editable UI,
visibility loss, or world teardown releases pointer lock and cancels affected
interactions. A package cannot hide the unlocked state or consume Escape.
Pointer-lock continuity is never promised across navigation or origins.

`webspace.input.keyboard-lock` is recognized so packages can fail or degrade
predictably, but the launch profile denies it. The Browser does not call
`navigator.keyboard.lock()`. A future profile must define allowed codes,
fullscreen coupling, visible trusted indication, denial fallback, and
guaranteed unlock before enabling it.

## 11. Dragging, grabbing, capture, and cancellation

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
bounded semantic controls, not raw poses. Contested or authoritative ownership
is resolved by the world simulation/authority after receiving intent; local
capture never proves ownership.

## 12. Text selection, clipboard, and composition

Text editing uses a Browser-owned native control associated with one declared
`textEditable` target and a granted `webspace.input.text-edit` capability. The
package receives bounded edit snapshots:

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
  unchanged and reports `not-granted` or `unsupported`;
- copy/cut requires a user gesture and `webspace.input.clipboard-write`; the
  Browser supplies only the selected plain text to the platform operation;
- background reads, polling, arbitrary MIME types, files, images, and silent
  writes are not exposed.

## 13. Ownership, precedence, and arbitration

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

## 14. Browser UI, accessibility, and universal escape

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

## 15. Failure, denial, fallback, and release behavior

Failures are local to the affected request or interaction unless P2 says a
required capability denial prevents package startup.

| Code | Meaning | Required Browser behavior |
|---|---|---|
| `not-granted` | capability or user permission denied | do not perform operation; retain safe unlocked/native fallback |
| `unsupported` | API/device/mode unavailable | retain supported semantic mappings and explain unavailable mode |
| `invalid-target` | target missing, inactive, or lacks action | drop request; cancel an existing record for that target |
| `conflict` | higher-priority owner already holds source | do not steal; report conflict for explicit requests |
| `interrupted` | focus/visibility/session/device changed | cancel and idempotently release capture, locks, focus, and routed state |
| `instance-gone` | package paused, unloaded, or crashed | stop delivery and perform lifecycle cleanup |
| `invalid-event` | bad version, non-finite coordinate, size/schema violation | reject event/request and development-log bounded detail |

World unload, teardown, worker crash, navigation, visibility loss, document blur,
XR session end, device disconnect, target removal, and grant revocation all
converge on the same cancel-and-release primitive. It is safe to call more than
once and completes even if the package boundary no longer responds.

The Browser never silently falls back from an unavailable trusted mechanism to
more privilege. Pointer-lock denial falls back to unlocked interaction;
Keyboard Lock remains denied; clipboard denial leaves text unchanged; XR
failure retains flat-screen entry; and focus failure leaves locomotion
available without delivering text to the world.

## 16. Implementation reconciliation

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

## 17. Acceptance tests

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
  controls obey the section 13 ordering with no duplicate delivery;
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
- keyboard-only and reduced-motion paths retain visible focus and trusted exit.

At least one real-browser automated test is required for Pointer Lock/focus,
touch/visual viewport text, clipboard denial, and composition because DOM stubs
cannot prove user-agent permission or editing behavior. XR may use an emulator
plus one named-device smoke test.

## 18. Migration notes

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

## 19. Deferred work and non-goals

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

## 20. Security and privacy analysis

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

## 21. Decision summary

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
