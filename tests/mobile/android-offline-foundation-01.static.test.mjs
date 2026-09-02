import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const store = read("src/lib/offline/offline-state-store.ts");
const contract = read("src/lib/offline/offline-pack-contract.ts");
const outbox = read("src/lib/offline/offline-outbox.ts");
const capacitor = read("capacitor.config.ts");
const fileClient = read("src/lib/offline/lesson-file-client.ts");
const fileCache = read("src/lib/offline/pdf-cache.ts");
const lessonRoute = read("src/routes/api/lesson-file.$resourceId.ts");
const textbookRoute = read("src/routes/api/subject-textbook.$textbookId.ts");

describe("OFFLINE-01 mobile foundation guards", () => {
  it("persists native metadata in the app-private data directory", () => {
    expect(store).toContain('OFFLINE_STATE_NATIVE_DIR = "tamkeen/offline"');
    expect(store).toContain("directory: Directory.Data");
    expect(store).toContain("Capacitor.isNativePlatform()");
    expect(store).toContain("OFFLINE_STATE_NATIVE_BACKUP_PATH");
    expect(store).toContain("OFFLINE_STATE_CORRUPT");
  });

  it("stores stable identifiers and hashes, never temporary delivery URLs", () => {
    expect(contract).toContain("resourceId");
    expect(contract).toContain("relativePath");
    expect(contract).toContain("sha256");
    expect(contract).not.toContain("signedUrl:");
    expect(contract).not.toContain("accessToken:");
    expect(outbox).not.toContain("refreshToken:");
  });

  it("keeps the current production shell until the final embedded-app gate", () => {
    expect(capacitor).toContain('url: "https://studentamkeen.com"');
    expect(capacitor).toContain('errorPath: "index.html"');
  });

  it("attests available server hashes before persistence and after device reads", () => {
    expect(lessonRoute).toContain('headers.set("x-file-sha256", sourceSha256)');
    expect(textbookRoute).toContain('headers.set("x-file-sha256", data.sha256)');
    expect(fileClient).toContain("file_download_hash_mismatch");
    expect(fileClient).toContain("contentSha256: observedSha256");
    expect(fileCache).toContain("matchesPersistedHash");
    expect(fileCache).toContain("await removeFile(resourceId)");
  });
});
