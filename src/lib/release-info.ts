declare const __TAMKEEN_RELEASE__:
  | {
      sha: string;
      builtAt: string;
    }
  | undefined;

export type ReleaseInfo = {
  sha: string;
  shortSha: string;
  builtAt: string;
  verifiable: boolean;
};

export function getReleaseInfo(): ReleaseInfo {
  const release =
    typeof __TAMKEEN_RELEASE__ === "undefined"
      ? { sha: "unknown", builtAt: "unknown" }
      : __TAMKEEN_RELEASE__;
  const sha = release.sha.trim();
  const verifiable = /^[0-9a-f]{40}$/i.test(sha);

  return {
    sha,
    shortSha: verifiable ? sha.slice(0, 8) : "غير معروف",
    builtAt: release.builtAt,
    verifiable,
  };
}
