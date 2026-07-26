# 0004: Embedding, Navigation, and Session Handover (experimental)

Status: **exploratory**. Not normative, no conformance claim. Proposal numbering is
provisional.

Depends on `0001-goals-trust-and-threat-model.md` (launch node **S0**). Maps
to launch nodes **P6** (embedding and cross-Webspace navigation decision) and
**R7** (session handover implementation). Companion to
`0003-identity-provider-interface.md`, which this proposal references for identity
continuity.

## 1. Problem

Webspaces are interconnected. A visitor steps through a portal from one world to another,
and the two worlds may be served from different origins, and may be published by different
operators. A host site may also want to run a Webspace on its own domain rather than send
users elsewhere.

Two creator/visitor problems follow:

- **Embedding:** a host wants a Webspace to run under its own domain and branding, then hand
  the visitor off to another Webspace under a different domain when they leave.
- **Navigation continuity:** crossing a portal should feel continuous (view, and where
  allowed, identity), the address bar should honestly reflect where the user now is, and
  Back/Forward/reload/deep links should behave predictably, without pretending the user
  never changed origin.

## 2. Why ordinary web capabilities are insufficient

- **A cross-origin top-level navigation tears down the current page.** There is no browser
  API for a smooth same-tab handoff between origins, so continuity must be reconstructed on
  the destination.
- **Storage is partitioned by top-level origin.** State written under one origin is not
  readable by the next, so continuity cannot rely on shared storage.
- **Fullscreen, pointer lock, and any XR session do not survive the navigation** and cannot
  be re-armed without a fresh user gesture on the destination.
- **The only practical same-tab cross-origin channel is a carried token** (for example
  `window.name`), which is readable by whatever the tab lands on and therefore must never
  carry secrets and must be treated as untrusted input.

## 3. Goals and non-goals

Goals:

- Define when a transition is same-origin (no handoff needed) versus cross-origin (explicit
  handoff).
- Define honest address-bar/history behavior.
- Define a short-lived, explicit, untrusted handoff token for continuity.
- Keep visual continuity an optional enhancement, never a correctness requirement.

Non-goals:

- Defining a smooth cross-origin rendering API (none exists).
- Requiring any particular visual technique.
- Specifying identity itself (see 0003). This proposal only carries an identity
  continuation hint.

## 4. Embedding and address-bar semantics

- **Same-site embed:** a host may run the runtime and a Webspace under its own origin. The
  address bar shows the host. Same-origin world-to-world transitions need no handoff.
- **External Webspace:** entering a Webspace under a different origin is a **top-level
  navigation to that Webspace's canonical URL**. The address bar then honestly shows the
  destination origin. The runtime does not spoof or hide the origin.

Likely direction (consistent with the launch plan): keep the runtime embeddable for
same-site use, and navigate top-level to the destination's canonical URL for an external
Webspace, preserving continuity through a short-lived explicit token rather than pretending
the origin did not change.

## 5. History and links

- **Back/Forward:** a cross-origin transition is a normal top-level navigation and appears
  in history. Back returns to the origin the user came from.
- **Reload:** reloading a destination URL loads that Webspace directly, with no dependency
  on a handoff token (the token is optional continuity, not a requirement to load).
- **Deep links / shareable URLs:** a Webspace's canonical URL is directly shareable and
  loads without any prior handoff. Handoff only enhances an in-session transition.

## 6. The handoff token

A short-lived, explicit token carried over a same-tab cross-origin channel. It MAY contain:

- an optional **visual continuity frame** (a downscaled snapshot for first paint),
- an optional **view/camera pose** so the destination's first live frame aligns,
- an optional **identity continuation hint** (non-secret) as defined by 0003.

Rules:

- **Untrusted input.** The destination MUST validate size and type and MUST tolerate a
  missing, malformed, oversized, or version-mismatched token by falling back to a normal
  load.
- **No secrets.** The token MUST NOT carry private keys, credentials, or another user's
  data. Identity continuation is a hint that triggers a proper re-authentication (0003),
  not a transfer of key material.
- **Short-lived and single-use.** Cleared on consumption, with a bounded lifetime.
- **Never blocks navigation.** If continuity cannot be established, the destination still
  loads normally.

## 7. Visual continuity (optional)

An implementation MAY paint the carried frame first, align to the carried view pose, and
crossfade to the live world to hide the navigation seam. This is a non-normative
enhancement. Implementation note: capturing a WebGL frame requires care when the renderer
does not preserve its drawing buffer, so the capture must happen in the same frame as a
render or via an explicit readback, or the snapshot will be blank.

## 8. State that does not survive, and re-arming it

Fullscreen, pointer lock, and XR sessions end at the navigation and require a fresh user
gesture on the destination to re-arm. Recommended:

- Treat this gesture as the natural "enter the world" action on arrival.
- Where the destination also needs a gesture to re-establish identity (see 0003, and
  browser mechanisms such as the Storage Access API or federated login), **piggyback it on
  the same gesture**, so a cross-origin transition costs at most one interaction.

## 9. XR limitation

A top-level cross-origin navigation ends the WebXR session and returns the user to the flat
page. There is no seamless cross-origin immersive handoff. Cross-origin transitions and any
identity settling should therefore happen on the flat page, before or after immersion, not
mid-session. This is a platform limitation to design around, not a defect to fix here.

## 10. Security and privacy consequences

- **Origin transparency.** The user must be able to see the true destination origin. The
  mechanism must not be usable to make one origin appear to be another.
- **Untrusted handoff data.** Per SECURITY.md, all carried data is untrusted and must be
  validated, and must never be a security boundary.
- **No secret transport.** The channel is readable by the destination, so it carries only
  non-sensitive continuity data.
- **Replay and lifetime.** Tokens are short-lived and single-use to limit reuse.
- **Cooperative, not trusted.** A handoff assumes both sides cooperate for UX, but neither
  side may rely on carried data for a security decision.

## 11. Multi-browser implementability

The model uses only ordinary top-level navigation plus a carried, validated token. Any
browser can implement it, and any pair of cooperating Webspaces can use it. Visual
continuity is optional, so an implementation that omits it is still conformant and simply
shows a normal load.

## 12. Versioning and fail-safe

- The token carries a version. Unknown versions are ignored and the destination loads
  normally.
- Absent or invalid tokens never block or delay a correct load.
- No transition depends on continuity succeeding.

## 13. Backward behavior

- A Webspace or host that does not participate in handoff still navigates normally, just
  without continuity.
- Older destinations ignore an unknown token and load directly.

## 14. Core vs optional

- **Core:** same-origin vs cross-origin transition rules, honest address-bar/history
  behavior, the untrusted-token contract, and graceful fallback.
- **Optional:** the visual freeze-frame/crossfade enhancement, and any identity
  continuation (which is governed by 0003).

## 15. Non-normative launch profile note

For the first launch, the primary path is the **same-origin** case (a community's homepage
and its world are one origin, so no handoff is needed). Cross-origin handoff is included as
a **demonstrated capability** proving that third-party Webspaces have a path forward, not as
a required launch user path. Per-device behavior (desktop, Android, iOS, XR) and the exact
capture/crossfade technique are implementation details for the reference browser.

## 16. Open questions

- The concrete token envelope, version field, and lifetime bound.
- A maximum size for a carried visual frame and how aggressively to downscale.
- Whether a canonical URL scheme for Webspaces belongs here or in the manifest proposal.
- How the destination signals to the origin-of-entry that continuity succeeded or was
  declined.

## 17. Relationship to other work

- **0003 (identity-provider interface):** supplies the identity continuation hint carried
  here and the re-authentication it triggers. Shares the "untrusted handoff data" rule.
- **0001 / S0:** supplies the controlling origin-transparency, trusted-exit,
  untrusted-handoff, and fail-safe requirements used here.
- The manifest proposal (pending) should define the canonical-URL and entry semantics this
  proposal assumes.
