/** Download bytes are data, not navigable HTML. Keep hosting HTML decoration away
 * from checksum-verified artifacts; rendering uses the validated manifest MIME type. */
export function artifactResponse(
  request: Request,
  method: "GET" | "HEAD",
  bytes: Uint8Array,
  sha256: string,
  contentType: string,
): Response {
  const headers = new Headers({
    "content-type": "application/octet-stream",
    "content-disposition": "attachment",
    "x-artifact-content-type": contentType,
    "content-length": String(bytes.byteLength),
    "cache-control": "private, max-age=0, must-revalidate, no-transform",
    "x-content-type-options": "nosniff",
    "x-file-sha256": sha256,
    "x-file-version": sha256,
    etag: `"${sha256}"`,
  });
  if (request.headers.get("if-none-match")?.replace(/"/g, "") === sha256) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(
    method === "HEAD"
      ? null
      : new Blob([Uint8Array.from(bytes)], { type: "application/octet-stream" }),
    { status: 200, headers },
  );
}
