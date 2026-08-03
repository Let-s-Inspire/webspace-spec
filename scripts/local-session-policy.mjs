export const PROFILE_DEFAULT = "profile-default";
export const LOCAL = "local";

export function localSessionSemanticErrors(manifest) {
  return manifest.session?.mode === LOCAL && manifest.authority !== undefined &&
    manifest.authority.mode !== "none"
    ? ["session.mode local conflicts with network-session authority"] : [];
}

export function resolveSessionPolicy({ world, host, browser, packageRequest } = {}) {
  for (const [name, value] of Object.entries({ world, host, browser })) {
    if (value !== undefined && value !== LOCAL) {
      throw new TypeError(`unknown ${name} session policy ${JSON.stringify(value)}`);
    }
  }
  if (packageRequest !== undefined && packageRequest !== LOCAL) {
    throw new TypeError("package request cannot broaden session policy");
  }
  return [world, host, browser, packageRequest].includes(LOCAL) ? LOCAL : PROFILE_DEFAULT;
}
