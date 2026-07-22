# Webspace Specifications

Open, vendor-neutral specifications for publishing, discovering, embedding,
and navigating interactive 3D spaces on the web.

## Status

This project is in its initial design phase. There is no stable `.wsp` format
yet, and no implementation should claim Webspace conformance at this stage.

Early work will define:

- The goals and non-goals of the Webspace standard.
- A threat model and permission-request model.
- A versioned `.wsp` manifest format.
- World lifecycle and capability negotiation.
- Navigation and portal semantics.
- Embedding and host communication.
- Optional identity, avatar, and networking-provider interfaces.
- Conformance requirements and fixtures.

## Principles

- Anyone can publish a Webspace without asking a vendor for permission.
- Any browser can implement the standard.
- Manifests request capabilities; they never grant permissions.
- The standard does not require one rendering engine, multiplayer system,
  identity provider, hosting provider, or browser implementation.
- Compatibility and security take priority over rapid standardization.
- Experimental behavior is versioned and clearly identified.

## Relationship to Implementations

[Webspace Browser](https://github.com/Let-s-Inspire/OpenMetaverse) is the
initial reference implementation. Easy Multiplayer is expected to be a
first-class networking provider, but neither product is required by the
standard.

## Repository Layout

- `proposals/` - numbered design proposals and unresolved questions.
- `spec/` - specification documents once behavior is mature enough to define.
- `schemas/` - machine-readable schemas and test fixtures.
- `conformance/` - implementation-neutral conformance tests when available.

## Contributing

The project is not yet accepting compatibility claims. Design discussion and
concrete use cases are welcome through GitHub issues. See
[CONTRIBUTING.md](CONTRIBUTING.md) before proposing normative behavior.

## Licensing

Specification text is intended to be available under Creative Commons
Attribution 4.0. Schemas, examples, and conformance code are intended to be
available under Apache License 2.0. See [LICENSE.md](LICENSE.md).

