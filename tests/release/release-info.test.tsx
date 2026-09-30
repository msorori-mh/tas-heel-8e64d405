import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { parseReleaseInfo } from "../../src/lib/release-info";
import { ReleaseDiagnostics } from "../../src/components/admin/ReleaseDiagnostics";

describe("release diagnostics", () => {
  const source = "b".repeat(64);
  it("labels the computed source fingerprint truthfully when Git is absent", () => {
    const release = parseReleaseInfo({
      sha: "unknown",
      sourceSha256: source,
      builtAt: "2026-09-30T00:00:00Z",
    });
    expect(release).toMatchObject({
      identityKind: "source",
      id: source,
      shortId: `src-${source.slice(0, 12)}`,
      verifiable: true,
    });
    const html = renderToStaticMarkup(<ReleaseDiagnostics release={release} />);
    expect(html).toContain("بصمة ملفات المصدر (SHA-256)");
    expect(html).toContain(source);
    expect(html).not.toContain("التزام الإصدار (Git)");
    expect(html).not.toContain("تعذر إثبات");
    expect(html).not.toContain("غير معروف");
  });
  it("retains exact Git identity when it is available, including older build metadata", () => {
    const sha = "A".repeat(40),
      release = parseReleaseInfo({ sha, sourceSha256: source });
    expect(release.identityKind).toBe("git");
    expect(release.id).toBe(sha.toLowerCase());
    expect(release.shortId).toBe(sha.toLowerCase().slice(0, 8));
    expect(parseReleaseInfo({ sha }).verifiable).toBe(true);
  });
  it("falls back from an invalid Git label to the source fingerprint", () => {
    expect(parseReleaseInfo({ sha: "main", sourceSha256: source }).identityKind).toBe("source");
  });
  it.each([
    undefined,
    {},
    { sha: "main", sourceSha256: "short" },
    { sha: "a".repeat(39), sourceSha256: "g".repeat(64) },
  ])("keeps the warning when no valid identity exists (%j)", (metadata) => {
    const release = parseReleaseInfo(metadata);
    expect(release.verifiable).toBe(false);
    const html = renderToStaticMarkup(<ReleaseDiagnostics release={release} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("تعذر إثبات بصمة هذا الإصدار");
  });
});
