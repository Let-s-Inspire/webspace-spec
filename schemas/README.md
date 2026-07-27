# Schemas

No stable Webspace schema has been published yet.

The first implementation profile is available under `experimental/v0/`:

- `package.schema.json` - shared definitions used by both package roles;
- `world.schema.json` - experimental loose `.wsp.json` manifest;
- `object.schema.json` - experimental loose `.wso.json` manifest;
- `origin-bridge-message.schema.json` - experimental origin-bridge control
  messages;
- `local-identity-delegation.schema.json` - experimental ID1 delegated-key
  authorization artifacts;
- `fixtures/valid/` - manifests that must validate;
- `fixtures/invalid/` - manifests that must fail for the reason in their
  filename.
- `fixtures/bridge-valid/` and `fixtures/bridge-invalid/` - origin-bridge
  protocol expectations.
- `fixtures/identity-valid/` and `fixtures/identity-invalid/` - ID1 artifact
  shape and canonicalization expectations.

From the repository root, run `npm test` to validate the schemas and fixtures.
Passing this suite does not imply Webspace conformance.
