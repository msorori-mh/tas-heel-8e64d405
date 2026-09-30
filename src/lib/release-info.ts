type ReleaseMetadata = { sha?: string; sourceSha256?: string; builtAt?: string };
declare const __TAMKEEN_RELEASE__: ReleaseMetadata | undefined;

export type ReleaseInfo = {
  sha: string;
  shortSha: string;
  sourceSha256: string;
  id: string;
  shortId: string;
  identityKind: "git" | "source" | "unknown";
  builtAt: string;
  verifiable: boolean;
};

export function parseReleaseInfo(release: ReleaseMetadata = {}): ReleaseInfo {
  const sha = release.sha?.trim().toLowerCase() ?? "unknown";
  const sourceSha256 = release.sourceSha256?.trim().toLowerCase() ?? "unknown";
  const hasGit = /^[0-9a-f]{40}$/i.test(sha);
  const hasSource = /^[0-9a-f]{64}$/i.test(sourceSha256);
  const identityKind = hasGit ? "git" : hasSource ? "source" : "unknown";
  const id = hasGit ? sha : hasSource ? sourceSha256 : "unknown";
  return {
    sha,
    shortSha: hasGit ? sha.slice(0, 8) : "غير معروف",
    sourceSha256,
    id,
    shortId: hasGit
      ? sha.slice(0, 8)
      : hasSource
        ? `src-${sourceSha256.slice(0, 12)}`
        : "غير معروف",
    identityKind,
    builtAt: release.builtAt || "unknown",
    verifiable: hasGit || hasSource,
  };
}

export function getReleaseInfo(): ReleaseInfo {
  return parseReleaseInfo(
    typeof __TAMKEEN_RELEASE__ === "undefined" ? undefined : __TAMKEEN_RELEASE__,
  );
}
