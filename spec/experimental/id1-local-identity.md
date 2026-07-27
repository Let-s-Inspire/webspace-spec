# ID1: Local identity contract (experimental)

Status: **experimental**. ID1 is a local implementation profile of the
provider-neutral boundary in [proposal 0003](../../proposals/0003-identity-provider-interface.md).
It does not change that boundary: packages request identity through the trusted
Browser broker and never receive a provider, credential, or custody object.

## Contract

An ID1 Browser maintains one persistent Ed25519 root identity in
Browser-controlled, Window-only storage. Every private key admitted into live
provider custody is a non-extractable `CryptoKey`; package code cannot access
the persisted representation, live key, or signing operation. The root is
local to this Browser profile and is not an account, portable identity, or
cross-device identifier.

The canonical world identity is:

```
webspace-world:v1:<authenticated-publisher-https-origin>/<package-id>
```

The origin is URL-normalized to its exact HTTPS origin: scheme and host are
lowercase, default port is removed, and path, query, fragment, credentials, and
opaque origins are rejected. `package-id` uses the experimental package ID
grammar. A declared scope is accepted only when it equals the value derived
from authenticated publisher evidence. Transport, relay, carrier, embedding
host, and Browser origins never supply identity scope.

Each canonical world has a persistent Ed25519 pseudonym identity whose live
private key is non-extractable. Different canonical worlds have different
public keys and no shared identifier or root-signed artifact. A delegation's
parent is the applicable world pseudonym public key and its authorization is
signed by that world's private key; the root public key is absent.
Implementations may derive or store world keys, provided these observable
properties hold.

## Delegated keys and proofs

A delegated key is a fresh, non-extractable Ed25519 key. Its signed
authorization has the machine-readable shape in
[`local-identity-delegation.schema.json`](../../schemas/experimental/v0/local-identity-delegation.schema.json)
and binds:

- version and algorithm;
- parent world-pseudonym public key and delegated public key;
- canonical world identity;
- exact HTTPS audience origin;
- a sorted, unique, non-empty set of scopes;
- integer issuance and expiry instants, with issuance before expiry.

`parentPublicKey` and `delegatedPublicKey` are the 32-byte RFC 8032 Ed25519
public-key encodings. `parentSignature` is a 64-byte RFC 8032 Ed25519
signature. All three are encoded as canonical, unpadded RFC 4648 base64url:
only `A-Z`, `a-z`, `0-9`, `-`, and `_` occur, no `=` padding occurs, and
decoding then unpadded-base64url re-encoding must reproduce the exact string.

The exact bytes covered by `parentSignature` are UTF-8 encoding of the ASCII
domain-separation prefix:

```
webspace-id1-delegation:v1:
```

immediately followed, with no delimiter or whitespace, by UTF-8 encoding of
the JSON serialization below. Property order is exactly as shown. Strings use
JSON escaping, numbers are JSON decimal safe integers, and `scopes` is already
sorted lexicographically by Unicode code point:

```json
{"version":1,"algorithm":"Ed25519","parentPublicKey":"<value>","delegatedPublicKey":"<value>","canonicalWorld":"<value>","audience":"<value>","scopes":["<value>"],"issuedAt":0,"expiresAt":1}
```

The serialized object contains exactly those nine claims and omits
`parentSignature`. Verifiers must reconstruct these bytes rather than trusting
the input artifact's property order or whitespace.

The valid deterministic fixture is reproducible from RFC 8410 Ed25519 private
seed bytes `00 01 ... 1f` for the parent and `20 21 ... 3f` for the delegated
key. These seeds exist only as public test-vector inputs and are not an ID1
storage format.

Issuance rejects invalid or non-canonical world identity, audience, scope, or
lifetime inputs. Signing fails at or after expiry according to the broker's
clock. Verification fails closed for malformed encodings, invalid parent or
proof signatures, expiry or pre-issuance use, missing scope, or any mismatch or
substitution of parent, canonical world, audience, scope, payload, issuance, or
expiry. A proof valid in one world is invalid in every other world even when
all other inputs are unchanged.

## Persistence, failure, and reset

The root and created world pseudonyms survive normal Browser restart. The
persisted representation is a Browser-owned JSON record in Window
`localStorage`: each Ed25519 key pair contains the canonical unpadded base64url
encoding of its 32-byte public key and PKCS #8 private-key bytes. This
representation is private key material and therefore may be decoded only
inside the trusted Window provider. On generation or load, the provider must
immediately import the private bytes as a non-extractable signing `CryptoKey`;
only that non-extractable key may enter live custody or perform ID1 signing.
Transient extractability used solely to create the persisted representation
must end before the identity becomes usable.

Package execution is confined to dedicated workers; `localStorage` is unavailable
there. ID1 must not place the persisted record, a structured-cloned
private `CryptoKey`, private-key bytes, or an equivalent signing handle in
IndexedDB, Cache Storage, OPFS, a worker message, or another package-worker
accessible surface.

Missing storage creates and atomically persists a new identity before use.
Unreadable, structurally corrupt, cryptographically inconsistent, or partially
written identity storage fails closed; it must not be silently replaced with a
new identity.

Resetting one world rotates only that world's pseudonym and invalidates its
prior delegations. Other world pseudonyms and the root remain unchanged.
Resetting local identity rotates the root and all world pseudonyms and makes
the Browser appear new everywhere; it requires an explicit Browser-controlled
action. Reset never reveals the prior or replacement root.

## Package isolation

The trusted Browser opens the provider before untrusted world or object package
execution. The package-loader boundary may transfer only a restricted broker
interface. Package code:

- receives a frozen request-only interface, not a provider instance or storage;
- cannot export, import, enumerate, or request root/private-key custody;
- cannot construct a provider within its worker/module realm;
- receives only results or stable denial errors for brokered operations.

The same rules apply to world and object packages. Missing boundary setup fails
before package activation. A conforming browser test must run hostile world and
object packages through the production loader and prove that they can neither
read persisted private material nor use any discovered key for signing,
including after enumerating and opening same-origin IndexedDB databases.

### World-facing proof request

The restricted broker must support `identity.request` with a request detail
containing the supported interface version, level `world-pseudonym`, an exact
canonical HTTPS audience origin, and a fresh 32-byte server challenge. Invalid
sizes, levels, versions, audiences, or repeated challenges fail with stable
errors.

A successful response contains level `world-pseudonym`, the stable world
pseudonym ID, canonical world, audience, canonical base64url challenge, expiry,
and the delegation/proof artifacts defined above. The delegation scope is
exactly `webspace.identity.proof`, its parent is the world pseudonym, and its
lifetime is at most 60 seconds. The proof payload is the exact challenge bytes.
The active broker instance tracks accepted challenges through expiry and
rejects reuse for the same world and audience. Challenge freshness remains server-authoritative: the
world server generates unpredictable challenges, enforces its bounded
lifetime, and consumes each challenge once.

The response contains no private or signing key. Unknown operations remain
unsupported, and root export or either reset operation remains denied to
packages.

## Browser-controlled identity controls

The trusted Browser client surface must let Browser UI inspect the active
world's pseudonym and root public identity, rotate only the active-world
pseudonym, and perform a full local reset. These operations are not transferred
to package workers. Scoped reset leaves the root and other worlds unchanged;
full reset rotates the root and every world pseudonym.

## Cross-context ordering

Every read-modify-write identity operation must hold one Browser-profile-wide
exclusive lock across refreshing the persisted record, computing the
replacement, durable persistence, and publishing the new live record. An
in-process promise queue alone is insufficient. ID1 requires a cross-context
lock facility such as the Web Locks API; if unavailable, ID1 is unsupported
and packages activate anonymously.

Delegated-key issuance participates in the same exclusive ordering as world
and full reset. If issuance wins the lock first, a later reset retires that
delegation under the replacement parent. If reset wins first, issuance uses
the replacement parent. Concurrent different-world creation must preserve
both entries, and concurrent same-world creation must return one pseudonym.

## Legacy storage migration

Before identity becomes usable or any package activates, the trusted Window
must delete the legacy
`webspacebrowser-trusted-local-identity-v1` IndexedDB database that stored
structured-cloned private `CryptoKey` objects. The Browser must wait for
successful deletion. An error or blocked deletion fails closed: it must not
activate package code, use legacy custody, generate a replacement identity, or
advertise ID1. Legacy private keys are not migrated through a worker-visible
surface.

## Browser platform support

ID1 requires Web Crypto Ed25519 key generation, signing, verification, and
PKCS #8 import/export sufficient to create the Window-only persisted
representation and import live private keys as non-extractable. It also
requires durable Window `localStorage`, dedicated-worker package confinement
without `localStorage`, a Browser-profile-wide exclusive lock, and successful
deletion of the legacy identity IndexedDB database.

A Browser lacking any required crypto, Window-only storage, worker isolation,
or migration behavior does not advertise ID1 and remains `anonymous` under
proposal 0003. It must not fall back to a live extractable private key, raw
seed-only storage, weaker algorithms, ephemeral identity presented as
persistent, worker-accessible storage, or the legacy IndexedDB design.

## Deterministic contract cases

An ID1 implementation must deterministically test:

1. persistent non-extractable root custody across restart;
2. canonical normalization plus invalid-input rejection;
3. stable per-world keys and cross-world unlinkability;
4. complete delegation bindings, valid proofs, substitutions, replay, and time;
5. delegated signing refusal at expiry;
6. corrupt-storage failure without identity replacement;
7. scoped world reset and full local reset effects;
8. real world/object package-loader isolation from provider and root custody,
   including IndexedDB enumeration, record reads, and attempted signing;
9. deletion of legacy identity IndexedDB before activation, with blocked or
   failed deletion and unavailable Window-only storage failing closed;
10. positive world-pseudonym request/proof verification and challenge replay
    rejection through the production package loader;
11. trusted inspection plus scoped/full reset controls;
12. separate-context same/different-world mutation preservation and deterministic
    reset-versus-delegation ordering.

Schema fixtures validate artifact shape, canonical encoding and normalization,
and the Ed25519 parent signature. Passing them does not establish full
behavioral conformance.

## Explicit exclusions

ID1 does not define Passport or another custodial service, Social/presence,
wallets, passkeys, recovery, global identity, cross-device synchronization,
backup, export/import, or portability. It does not grant package capabilities,
define consent UI, or replace proposal 0003's anonymous downgrade and
provider-selection rules.
