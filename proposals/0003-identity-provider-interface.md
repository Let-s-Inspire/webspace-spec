# 0003: Identity Provider Interface (experimental)

Status: **exploratory**. This proposal is not normative and makes no conformance claim.
Proposal numbering is provisional.

Depends on `0001-goals-trust-and-threat-model.md` (launch node **S0**). This
document maps to launch node **P8** (generic Webspace
identity-provider interface). It is deliberately narrow: it defines a *seam*, not a
specific identity product.

Related: the embedding/navigation and session-handover proposal (pending) governs how an
identity continues across an origin change. This proposal governs how a world learns who a
user is within a single Webspace.

## 1. Problem

A Webspace (a world) frequently needs to know something about the visitor:

- nothing at all (a pure anonymous visitor),
- a stable-but-anonymous handle so the world can remember them between visits,
- a globally recognizable identity so friends or cross-world features work,
- or an external account managed by the world's own operator (for example a community's
  existing member accounts).

Today every world would have to reinvent this, each with its own login, and each would be
tempted to collect credentials directly. That is bad for creators (no shared primitive),
bad for visitors (many logins, phishing risk), and bad for the medium (identity would get
welded to one vendor). A Webspace also runs as untrusted third-party code, so it must never
be handed private key material or user credentials.

We want one implementation-neutral interface through which a world can *request* an
identity of a given strength, the browser and user can *grant or refuse* it, and the world
receives only a verifiable, appropriately-scoped result.

## 2. Why ordinary web capabilities are insufficient

- **Same-origin policy and storage partitioning** stop identity from being shared across
  the origins a user moves between. A raw login on one origin does not carry to the next.
- **Worlds are untrusted worker code.** They cannot be trusted with private keys, tokens,
  or passwords, so identity operations must be brokered by the trusted runtime, not done by
  the world.
- **There is no web primitive for "prove a user to a 3D world"** at variable strength, with
  unlinkable-per-world identity as the safe default.
- **Federated web login (OAuth/OIDC/FedCM) is a building block, not the whole answer.** It
  authenticates a user to a relying party, but it does not by itself provide the
  unlinkable-per-world pseudonym model, the untrusted-world brokering, or the
  provider-neutral seam this medium needs. Providers may use those mechanisms internally.

## 3. Goals and non-goals

Goals:

- A single, versioned, provider-neutral interface for identity in a Webspace.
- Untrusted world code never touches keys, credentials, or another origin's session.
- Unlinkable-per-world identity as the privacy-preserving default.
- A verification model a world's own server can check without trusting the client.
- Room for many provider kinds (local keypair, custodial service, external account, wallet)
  behind the same seam.

Non-goals (out of scope here):

- Defining any specific identity product or service.
- Defining social features (friends, presence). Those consume identity but are separate.
- Mandating a cryptographic suite. This proposal describes roles and guarantees, not a
  ciphersuite.
- Making a stable-conformance claim.

## 4. Core model

Three roles:

- **World**: untrusted content. It *requests* identity and *receives* a scoped result. It
  never sees keys or credentials and never talks to a provider directly.
- **Broker**: the trusted Webspace Browser runtime. It mediates every identity request,
  applies user consent, talks to providers, and returns only a scoped, verifiable result to
  the world. The browser remains authoritative over consent and isolation.
- **Identity provider**: the thing that actually holds or vouches for the user's identity.
  Kinds include a local device keypair, a custodial identity service, a world operator's
  external account system, or a wallet. All sit behind the same provider interface.

A world never chooses or contacts a provider. It states *what strength of identity it
needs*, and the broker resolves that against whatever provider(s) the user has, subject to
consent.

### 4.1 Identity strength levels

A world requests one of these levels. Higher levels require stronger consent.

| Level | The world learns | Default consent |
|---|---|---|
| `anonymous` | nothing stable | granted |
| `world-pseudonym` | a stable identifier unique to this world, unlinkable to other worlds | granted automatically (privacy-preserving) |
| `global` | a cross-world identifier the user presents deliberately | explicit user consent, at least once per world |
| `external:<provider>` | an account issued by a named external provider (e.g. a world operator) | provider-defined, plus user consent |

`world-pseudonym` is the recommended default for "remember me here" needs, because it gives
persistence without cross-world tracking.

### 4.2 Capability request, not grant

Consistent with the standard's principle that a manifest requests capabilities but never
grants permission: a Webspace declares the identity levels it may request, and may request
at runtime, but the browser and user decide whether to grant. An ungranted request resolves
to the highest level the user allows, down to `anonymous`. Worlds must handle `anonymous`.

## 5. Interfaces (illustrative, non-normative)

Language-neutral shapes to convey structure, not a binding API.

World-facing request (called by world code, brokered by the runtime):

```
// Returns a resolved identity handle, or an anonymous handle if refused.
requestIdentity({
  level: "anonymous" | "world-pseudonym" | "global" | "external:<name>",
  // A world-supplied nonce lets the world's server verify freshness.
  challenge?: bytes
}) -> {
  level,                 // the level actually granted (may be lower than requested)
  id,                    // stable identifier at that level, or null for anonymous
  proof?,                // signature/claim over (worldId, challenge), for server checks
  displayHints?,         // optional, consented display name/avatar for convenience
  expiresAt?
}
```

Provider interface (implemented by a provider, called only by the broker):

```
authenticate(context) -> providerSession        // establish who the user is to the provider
deriveWorldPseudonym(worldId) -> { id, sign(challenge) }   // unlinkable per-world identity
resolveGlobalIdentity() -> { id, sign(challenge) }         // linkable, consent-gated
capabilities() -> { levelsSupported, custodyKind, ... }
```

Notes:

- `sign(challenge)` is performed inside the broker/provider boundary. The world receives the
  signature (proof), never the key.
- A provider may implement signing via a delegated session key (see 7) so that frequent
  proofs do not require a user gesture per proof.

## 6. World identity and per-world pseudonyms

- A `world-pseudonym` is derived so that it is **stable per world** but **unlinkable across
  worlds**. Two worlds cannot collude to determine that two pseudonyms are the same user.
- The default **world id** is derived from the package's authenticated publisher origin and
  package ID, so the pseudonym is stable whether the package is acquired directly, through
  its origin bridge, or through a relay, and whether it is entered directly or through an
  embedding host. The relay origin, Browser host origin, carrier URL, and transport URL
  never become identity scope merely because they supplied bytes. A package may declare a
  different identity scope only within its authenticated publisher origin's authority.
  Claiming another origin's scope requires that origin to vouch for it (for example a
  `.well-known` delegation). This prevents one world from harvesting the pseudonyms a user
  presents to another.
- Determinism across a user's devices comes from the provider deriving the pseudonym from a
  root the user carries, not from per-device state. How that root is held is provider-defined
  (device keypair, custodial service, wallet).

## 7. Delegated signing (optional provider mechanism)

Some providers gate every signature behind a user action (a wallet prompt, or a remote
service call). To keep frequent identity proofs frictionless, a provider may authorize a
short-lived, scope-limited local signing key once, then satisfy later proofs locally.

- The authorization must be **scoped** (identity proofs only, never unrelated powers such as
  payments) and **expiring**.
- Enforcement of scope is by verifiers honoring the signed authorization, not by the
  underlying custodian.
- Delegation applies to `global` operations. `world-pseudonym` proofs should be produced
  without revealing a shared root across worlds, to preserve unlinkability.

This mechanism is optional and provider-internal. The world sees only proofs.

## 8. Verification (server-authoritative)

Identity claims presented by client code are not trusted. A world's server verifies:

1. It issues or requires a fresh `challenge` (nonce, bounded lifetime).
2. It checks `proof` is a valid signature over `(worldId, challenge)` for the presented
   `id`.
3. For `external:<provider>` it verifies the claim against that provider per the provider's
   published verification method.

Security-sensitive decisions (membership, roles, economy, moderation) must be made by a
server that performs this verification. A client-asserted level or id is advisory only.

## 9. Security and privacy consequences

- **No key or credential exposure to worlds.** Worlds get proofs, never keys. Login and
  credential entry happen on the provider's own origin, never inside untrusted world code
  (anti-phishing).
- **Unlinkability by default.** `world-pseudonym` prevents cross-world correlation.
  Revealing `global` identity is an explicit, consented act.
- **Handoff/identity data is untrusted input.** Anything a world or an embedding host passes
  must be size/type-validated and never contain another user's secrets. A continuation hint
  crossing origins must not be a private key.
- **Replay and impersonation.** Challenges must be fresh and bounded. Proofs are scoped to a
  specific `worldId`.
- **Bounded trust in embedding hosts.** When a provider issues credentials to a page on a
  third-party host origin, it should issue the minimum needed (a per-world key for that
  host's own world, and a `global` delegation only with consent), never a root secret. This
  bounds what a hostile host can do to the identity it holds.
- **Consent is browser-authoritative.** The world cannot force a level; the browser and user
  decide.

## 10. Multi-browser implementability

The interface is abstract. Any browser can implement the broker role and support one or more
providers. Providers are pluggable and provider-neutral, so no single identity vendor is
required. A conforming browser must at minimum support `anonymous` and should support
`world-pseudonym`; `global` and `external` provider support is optional and negotiated.

## 11. Versioning, compatibility, and fail-safe

- Requests carry an interface version. Unknown versions fail safe (resolve to `anonymous` or
  refuse clearly), never silently succeed at a wrong level.
- Unknown levels or unknown `external:<provider>` names resolve down, never up.
- A manifest that requests no identity gets `anonymous`.
- An implementation that does not support a requested level must degrade to the highest level
  it does support (down to `anonymous`) and report the granted level, so worlds can adapt.

## 12. Backward behavior

- Older manifests without identity requests behave as `anonymous`.
- Older implementations encountering a new level degrade per 11.
- Worlds must always handle the `anonymous` outcome, because any request may be refused.

## 13. Core vs optional

- **Core (this proposal):** the request/consent/verify seam and the strength levels.
- **Optional / out of scope:** specific providers (a custodial identity service, wallet
  integration, a given operator's account system) and any social features built on top.

## 14. Non-normative launch profile note

For the first launch (a community reopening as the first Webspace), only two providers need
to exist: `anonymous`, and one `external:` provider that maps the community's existing
session to a verifiable world identity with member/guest/moderator distinctions. The value
of this proposal at launch is purely that the community's identity is *one provider behind
this seam*, so a local-keypair provider, a custodial service, or a wallet can be added later
without reworking worlds. No other provider is required for launch.

## 15. Open questions

- Exact wire format of a `proof` and the challenge lifetime bounds.
- How `displayHints` consent is expressed and revoked.
- The `.well-known` delegation format for a cross-origin identity scope.
- How `external:<provider>` discovery combines manifest provider hints, user configuration,
  and verified `.well-known` metadata. Manifest hints are untrusted and never bypass the
  broker.
- Minimum required cryptographic guarantees to state without over-specifying a ciphersuite.

## 16. Relationship to other work

- **0001 / S0:** supplies the controlling goals and threat model. In
  particular, automatic `world-pseudonym` behavior still needs reconciliation
  with 0001's transparency, reset, and privacy requirements.
- The **embedding/navigation + session-handover** proposal covers identity continuity across
  an origin change and shares the "untrusted handoff data" rule.
- The **package-source + origin-bridge** proposal uses this broker to obtain
  short-lived, exact-origin, package-read credentials for private packages.
  Those credentials authorize package delivery only and are never exposed to
  world code or an untrusted relay.
- Post-launch identity products (a custodial Passport service, a social/presence service,
  wallet and passkey custody) are consumers of this seam, specified separately, and must not
  be prerequisites for it.
