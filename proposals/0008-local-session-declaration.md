# 0008: Local Session Declaration

Status: **draft experimental profile**. This proposal is not a stable
specification and does not authorize implementation or deployment.

Depends on [0001](0001-goals-trust-and-threat-model.md) and extends the world
manifest defined by [0002](0002-experimental-package-profile.md).

## 1. Scope

This proposal defines only one world-manifest declaration and its
multiplayer-session effect.

## 2. Wire declaration

A world that requires non-networked execution MUST declare:

```json
{ "session": { "mode": "local" } }
```

`session` is optional for backward compatibility. When it is absent, the
experimental-v0 profile retains its existing session behavior: absence MUST NOT
be interpreted as either a local guarantee or a request to create networking.

The `session` object is closed. An unknown mode, malformed value, or unknown
member MUST be rejected before package execution. A local declaration combined
with `authority.mode` equal to `peer`, `dedicated`, or `provider` is conflicting
and MUST be rejected before side effects. `authority.mode: "none"` is compatible.

## 3. Local multiplayer-session semantics

For `session.mode: "local"`, the Browser MUST NOT create or join multiplayer or
session transports, peer sessions, dedicated sessions, trackers, relays,
presence, roster publication or consumption, network voice, or networked package
`sceneData`. A local simulation MAY use an ephemeral local participant, but it
MUST NOT publish identity or participant state and MUST NOT create presence.

Local mode separates these network categories:

1. **Multiplayer/session networking** is prohibited as described above.
2. **Integrity-checked acquisition** of the world and its declared resources is
   permitted subject to Browser policy; acquisition is not session networking.
3. **Browser-owned identity-provider traffic**, including proof acquisition,
   refresh, invalidation, and revocation, MAY occur subject to Browser policy;
   it is not package networking and gives the package no credentials, provider
   token, reusable proof, URL choice, transport, or broker object.
4. **Trusted host services** MAY be separately authorized through a typed,
   bounded Browser-controlled boundary. They give package code no generic fetch,
   arbitrary URL choice, reusable network authority, cookies, or credentials.
5. **Arbitrary package-originated network access** remains denied unless a
   separate Browser policy explicitly grants it; local mode never grants it.

## 4. Authority composition and non-broadening

The effective session policy MUST be the most restrictive intersection of the
world declaration, host request, and Browser policy. Browser policy is
authoritative and MUST fail closed. A host or Browser MAY narrow an undeclared
world to local execution. Neither a host nor package code may weaken an explicit
world local declaration. Package code MUST NOT escalate, replace, or renegotiate
the effective local policy.

If any required policy input is unknown, malformed, contradictory, or cannot be
enforced deterministically, loading MUST fail before multiplayer/session side
effects. Implementations MUST NOT silently fall back to networked execution.

## 5. Examples

Compatible: `{"session":{"mode":"local"},"authority":{"mode":"none"}}`.
Legacy manifests omit `session`. Conflicting and invalid:
`{"session":{"mode":"local"},"authority":{"mode":"peer"}}`.

## 6. Conformance

A conforming validator MUST accept the exact local declaration and legacy
manifests without the field; MUST reject unknown, malformed, extended, and
authority-conflicting declarations; and MUST test that host and package requests
cannot broaden explicit local policy. Schema acceptance alone does not establish
runtime conformance.
