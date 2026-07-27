# ID1: Local identity contract (experimental)

Status: **experimental**. ID1 is a local implementation profile of the
provider-neutral boundary in [proposal 0003](../../proposals/0003-identity-provider-interface.md).
It does not change that boundary: packages request identity through the trusted
Browser broker and never receive a provider, credential, or custody object.

## Contract

An ID1 Browser maintains one persistent, non-extractable Ed25519 root key pair
in Browser-controlled storage. Package code cannot access that storage or root
material. The root is local to this Browser profile and is not an account,
portable identity, or cross-device identifier.

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

Each canonical world has a persistent, non-extractable Ed25519 pseudonym key
pair. Different canonical worlds have different public keys and no shared
identifier or root-signed artifact. A delegation's parent is the applicable
world pseudonym public key and its authorization is signed by that world's
private key; the root public key is absent. Implementations may derive or store
world keys, provided these observable properties hold.

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

The root and created world pseudonyms survive normal Browser restart. Stored
private keys remain non-extractable. Missing storage creates and atomically
persists a new identity before use. Unreadable, structurally corrupt,
cryptographically inconsistent, or partially written identity storage fails
closed; it must not be silently replaced with a new identity.

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
before package activation.

## Browser platform support

ID1 requires Web Crypto Ed25519 key generation, signing, verification, and
structured cloning of non-extractable `CryptoKey` objects into persistent,
Browser-controlled IndexedDB storage. A Browser lacking any required behavior
does not advertise ID1 and remains `anonymous` under proposal 0003. It must not
fall back to extractable keys, JavaScript seed storage, weaker algorithms,
ephemeral identity presented as persistent, or package-accessible storage.

## Deterministic contract cases

An ID1 implementation must deterministically test:

1. persistent non-extractable root custody across restart;
2. canonical normalization plus invalid-input rejection;
3. stable per-world keys and cross-world unlinkability;
4. complete delegation bindings, valid proofs, substitutions, replay, and time;
5. delegated signing refusal at expiry;
6. corrupt-storage failure without identity replacement;
7. scoped world reset and full local reset effects;
8. real world/object package-loader isolation from provider and root custody.

Schema fixtures validate artifact shape, canonical encoding and normalization,
and the Ed25519 parent signature. Passing them does not establish full
behavioral conformance.

## Explicit exclusions

ID1 does not define Passport or another custodial service, Social/presence,
wallets, passkeys, recovery, global identity, cross-device synchronization,
backup, export/import, or portability. It does not grant package capabilities,
define consent UI, or replace proposal 0003's anonymous downgrade and
provider-selection rules.
