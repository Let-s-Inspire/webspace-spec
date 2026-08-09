# 0009: Content Runtime Resource Resolution (experimental)

Status: **exploratory**. Not normative, no conformance claim. Proposal numbering
does not imply acceptance or stability.

This proposal defines how a worker-hosted Webspace package resolves its own
package resources through the Browser-owned content runtime, instead of relying
on `import.meta.url`. It specifies two deliberately distinct resolution
contracts and the trust boundary between them.

## 1. Motivation and trust framing

A package entry module runs in a worker that the Browser loads from a
host-created blob (`URL.createObjectURL`), and modules the import shim must
transform to apply an import map are likewise executed from blob URLs.
Consequently `import.meta.url` inside a worker package is a client-origin blob
URL, not the package's canonical location. A package cannot self-derive a
correct base for its own resources.

The content runtime is a Browser-owned host contract: the Browser, which owns
the canonical package location and the integrity-verified bytes, resolves on the
package's behalf. A package supplies only a relative path or a declared asset
name; it never chooses origin, scheme, base URL, credentials, or redirect
policy.

## 2. Extension declaration and version negotiation

A package opts in by declaring the content-runtime extension under a reverse-DNS
extension key and by exporting the content-runtime entry factory. The extension
key MUST also appear in `compatibility.requires` (existing manifest rule).

Two versions exist:

- `webspace.content-runtime.v0.1` — existing. Provides `resolveAsset` (§3.1).
- `webspace.content-runtime.v0.2` — this proposal. Adds `resolvePackageUrl`
  (§3.2) and the `packageBase` authority (§4). `resolveAsset` is unchanged.

The Browser MUST negotiate the **exact** declared version. An unknown or
unsupported version MUST **fail closed**: the content runtime is not installed
and the package does not receive a partial or downgraded API. The Browser MUST
NOT silently ignore, downgrade, or up-negotiate an unrecognized version.

## 3. Two resolution contracts

These are separate methods with separate trust contracts. They are never
interchangeable.

### 3.1 `resolveAsset(name)` — integrity contract (v0.1, unchanged)

Resolves a **declared** manifest asset by name to a host-provided reference
backed by the package's **integrity-verified bytes** (a host-owned blob URL).
The bytes were fetched and integrity-checked by the loader; the reference is
immutable and requires no second fetch, so it is byte-authoritative. Unknown
names fail closed; an integrity-mismatched declared asset remains denied.

This is the contract for executable code and any integrity-sensitive resource.

### 3.2 `resolvePackageUrl(relativePath)` — location contract (v0.2, new)

Resolves a package-relative path to the canonical, same-origin package URL under
`packageBase` (§4). It performs no fetch. It returns **location authority
only**: the correct URL for a package-relative path. It makes **no per-byte
integrity assertion**.

Honesty about the boundary: a statement that this URL "must not be used for
executable code" is **guidance, not an enforceable security boundary**. Once a
package holds an HTTPS URL string, it can pass that string to `import()` or
`fetch()`, and the Browser cannot prevent it. The contract therefore states
plainly: `resolvePackageUrl` supplies location authority **without** byte
integrity. Integrity-sensitive or executable consumers MUST use `resolveAsset`.
Conformance and security do not depend on packages honoring a "non-executable"
hint; they depend on integrity-sensitive consumers **choosing** `resolveAsset`.

## 4. `packageBase` authority

`packageBase` is the **canonical, loader-owned** package root, `new URL('./',
<canonical package manifest URL>)`. It is **location authority**.

The loader verifies the package's metadata and bytes (integrity). The base URL
itself is not "integrity-verified" — describing a URL as integrity-verified
conflates location with bytes. `packageBase` is the canonical location the
loader used to fetch the verified package; `resolveAsset` carries the byte
integrity, `resolvePackageUrl` carries only the location.

The package supplies only a relative path. It cannot choose origin, scheme,
base, credentials, or redirect policy.

## 5. Fail-closed rejection matrix for `resolvePackageUrl`

`resolvePackageUrl` MUST reject (throw; return no URL) when `relativePath`:

1. is an absolute URL (contains any scheme) or is protocol-relative (`//host/…`);
2. contains a scheme token for `blob:`, `data:`, `javascript:`, `file:`, or any
   scheme other than the package's own origin resolution;
3. contains path traversal or a path separator in **any encoding**, including
   at least:
   - literal `..`, and single-dot `.` segments that alter containment;
   - backslash `\`;
   - percent-encoded separators and traversal: `%2e`, `%2E`, `%2f`, `%2F`,
     `%5c`, `%5C`;
   - double or multiple encoding: `%252e`, `%252E`, `%252f`, `%255c`, and deeper;
   - mixed-case encodings of any of the above (`%2F` and `%2f`, `%5C` and `%5c`);
   - Unicode, overlong, or otherwise ambiguous normalizations of a separator or
     traversal;
4. contains a NUL or any control character;
5. carries a query or fragment. v0.2 rejects both; a later version may define
   safe handling explicitly if a need arises;
6. after resolution does not remain contained within the package content root by
   **segment-based containment** (§6).

Rejection is performed host-side against the host-owned `packageBase`; a package
cannot bypass it. Validation MUST occur on the raw input before and after
resolution — decoding once and re-checking — so a single decode cannot smuggle a
separator that a post-decode check would miss.

## 6. Directory and containment semantics

- **Trailing slash.** A `relativePath` ending in `/` denotes a directory base
  onto which a caller appends a leaf; a path without a trailing slash denotes a
  file. Directory bases are still subject to §5 and §6.
- **Segment-based containment, not string prefix.** Containment MUST be checked
  on `/`-delimited path segments, not by a naive string prefix. The resolver:
  1. rejects any §5 case before resolution;
  2. resolves `relativePath` against `packageBase` using URL semantics;
  3. requires that the sequence of `packageBase` path segments is a prefix of the
     resolved URL's path segments by **segment equality**. A string-prefix test
     is insufficient and MUST NOT be used: base `/pkg/a/` must contain
     `/pkg/a/x` but MUST NOT be considered to contain `/pkg/ab/x`, which a naive
     `startsWith('/pkg/a')` would wrongly accept;
  4. rejects if resolution introduces any `.` or `..` segment or leaves the base
     segment prefix or changes origin.

## 7. Redirect semantics

`resolvePackageUrl` performs no fetch and follows no redirect. It returns the
canonical **requested** same-origin URL. A subsequent cross-origin redirect
during the package's own `fetch`/`import` is governed by the browser (CORS) and
cannot relocate the resolver's authority: the requested URL is fixed to the
package origin, and the resolver asserted nothing about the response bytes.

The spec is explicit about which URL each method yields:

- `resolvePackageUrl` returns the canonical **requested** URL (no fetch, no
  knowledge of a final URL).
- `resolveAsset` returns a reference to **already-verified bytes**; there is no
  request or redirect at use time.

## 8. Return values

- `resolveAsset` returns a host-owned reference to integrity-verified bytes (a
  blob URL). No credentials or tokens.
- `resolvePackageUrl` returns an immutable absolute HTTPS URL string on the
  package origin. No credentials or tokens, no transport or loader handle.

## 9. Lifecycle and isolation

- Both methods are bound to a single package/world generation (one descriptor).
  Use after teardown MUST fail predictably.
- Separate packages or objects MUST NOT resolve through one another's root; each
  descriptor carries its own `packageBase`.
- Resolution is pure computation. It MUST NOT open a socket, start multiplayer,
  presence, or grants, and MUST NOT weaken source, CORS, identity, or capability
  policy.

## 10. Acceptance expectations

A conforming implementation is expected to demonstrate, through the real worker
and package loader (not source inspection):

- a bare-import package (so `import.meta.url` is a blob) where
  `resolvePackageUrl('./asset.bin')` returns the canonical package HTTPS URL and
  `resolveAsset(<declaredName>)` returns integrity-verified bytes;
- version negotiation: an unknown or unsupported version fails closed;
- the full §5/§6 rejection matrix, including every encoded, mixed-case, and
  double-encoded separator/traversal case, and segment-based containment
  (`/pkg/a/` does not contain `/pkg/ab/`);
- contract distinctness: `resolvePackageUrl` never returns a blob URL and
  `resolveAsset` never returns an HTTPS package URL;
- lifecycle: resolution after teardown fails; one package cannot resolve
  another's root;
- integrity: an integrity-mismatched declared asset remains denied; the spec
  makes no security claim that depends on a package refraining from passing a
  `resolvePackageUrl` result to `import()`.

## 11. Non-goals

- Resolving a declared **dependency** package's assets (cross-package resolution)
  is out of scope for v0.2. A package resolves only within its own root.
- Machine-checkable schema enforcement of the extension and its version is a
  possible follow-up; v0.2 states negotiation and fail-closed behavior
  normatively here.
