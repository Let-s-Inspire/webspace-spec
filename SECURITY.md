# Security

The Webspace standard is not yet stable and should not be treated as a security
boundary in production.

Security-sensitive design reports should initially be sent privately to the
repository maintainers through GitHub's private vulnerability reporting once
that feature is enabled. Until then, avoid publishing an exploitable issue and
contact the Let-s-Inspire organization owner directly.

The standard will follow these baseline rules:

- A manifest can request a capability but cannot grant itself permission.
- Browsers remain authoritative over user consent and isolation.
- Cross-origin access follows the web security model unless an explicit,
  narrowly scoped capability says otherwise.
- Unknown capabilities and unsupported manifest versions fail safely.
- Navigation and handoff data must be treated as untrusted input.
- Identity, microphone, storage, payment, and cross-world communication require
  explicit security analysis.

