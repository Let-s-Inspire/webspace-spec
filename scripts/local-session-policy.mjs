export const PROFILE_DEFAULT = "profile-default";
export const LOCAL = "local";
export const AUTHORITY_MATRIX = Object.freeze({
  absent: true,
  none: true,
  peer: false,
  dedicated: false,
  provider: false,
});

export function localSessionSemanticErrors(manifest) {
  return manifest.session?.mode === LOCAL && manifest.authority !== undefined &&
    manifest.authority.mode !== "none"
    ? ["session.mode local conflicts with network-session authority"] : [];
}

export function assertCompleteAuthorityMatrix(evaluate = localSessionSemanticErrors) {
  for (const [mode, accepted] of Object.entries(AUTHORITY_MATRIX)) {
    const manifest = mode === "absent"
      ? { session: { mode: LOCAL } }
      : { session: { mode: LOCAL }, authority: { mode } };
    const actual = evaluate(manifest).length === 0;
    if (actual !== accepted) throw new Error(`authority mode ${mode} matrix mismatch`);
  }
}

export function resolveSessionPolicy(input = {}) {
  for (const name of Object.keys(input)) {
    if (!["world", "host", "browser"].includes(name)) {
      throw new TypeError(`unsupported session policy input ${JSON.stringify(name)}`);
    }
  }
  const { world, host, browser } = input;
  for (const [name, value] of Object.entries({ world, host, browser })) {
    if (value !== undefined && value !== LOCAL) {
      throw new TypeError(`unknown ${name} session policy ${JSON.stringify(value)}`);
    }
  }
  return [world, host, browser].includes(LOCAL) ? LOCAL : PROFILE_DEFAULT;
}
