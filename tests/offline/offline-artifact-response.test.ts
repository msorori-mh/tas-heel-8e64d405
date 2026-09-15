import { expect, it } from "vitest";
import { artifactResponse } from "../../src/lib/offline/offline-artifact-response";
import { sha256Hex } from "../../src/lib/offline/offline-pack-contract";

it.each(["text/html; charset=utf-8", "application/json; charset=utf-8"])(
  "transports %s as exact non-navigable bytes across an HTML-decorating host",
  async (mime) => {
    const bytes = new TextEncoder().encode('<html dir="rtl"><body>درس عربي 🧪</body></html>');
    const hash = await sha256Hex(bytes);
    const response = artifactResponse(
      new Request("https://example.test/api/artifact"),
      "GET",
      bytes,
      hash,
      mime,
    );
    // HTML hosting layers decorate text/html pages. Artifact delivery must not enter that path.
    expect(response.headers.get("content-type")).toBe("application/octet-stream");
    expect(response.headers.get("content-disposition")).toBe("attachment");
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-transform");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-artifact-content-type")).toBe(mime);
    const delivered = new Uint8Array(await response.arrayBuffer());
    expect(delivered).toEqual(bytes);
    expect(delivered.byteLength).toBe(Number(response.headers.get("content-length")));
    expect(await sha256Hex(delivered)).toBe(response.headers.get("x-file-sha256"));
  },
);

it("preserves HEAD and conditional request semantics without a body", async () => {
  const bytes = new TextEncoder().encode("المحتوى");
  const hash = await sha256Hex(bytes);
  const head = artifactResponse(
    new Request("https://example.test/api/artifact"),
    "HEAD",
    bytes,
    hash,
    "text/html",
  );
  expect(head.status).toBe(200);
  expect(head.body).toBeNull();
  expect(head.headers.get("content-length")).toBe(String(bytes.byteLength));
  const cached = artifactResponse(
    new Request("https://example.test/api/artifact", { headers: { "if-none-match": `"${hash}"` } }),
    "GET",
    bytes,
    hash,
    "text/html",
  );
  expect(cached.status).toBe(304);
  expect(cached.body).toBeNull();
  expect(cached.headers.get("etag")).toBe(`"${hash}"`);
});
