import { assertAllowedSupabaseUrl } from "./config.mjs";

export function guardedFetch(rawFetch) {
  return async (input, init) => {
    let request = new Request(input, init);
    for (let hops = 0; hops < 10; hops++) {
      assertAllowedSupabaseUrl(request);
      const preserved = request.clone();
      const response = await rawFetch(request, { redirect: "manual" });
      if (![301, 302, 303, 307, 308].includes(response.status) || !response.headers.has("location"))
        return response;
      if (request.redirect === "manual") return response;
      if (request.redirect === "error") {
        await response.body?.cancel();
        throw new Error("PREVIEW_REDIRECT_NOT_ALLOWED");
      }
      const next = new URL(response.headers.get("location"), request.url);
      await response.body?.cancel();
      assertAllowedSupabaseUrl(next);
      const headers = new Headers(request.headers);
      if (next.origin !== new URL(request.url).origin) {
        headers.delete("authorization");
        headers.delete("cookie");
        headers.delete("apikey");
      }
      let method = request.method;
      if (
        (response.status === 303 && method !== "HEAD") ||
        ([301, 302].includes(response.status) && method === "POST")
      ) {
        method = "GET";
        headers.delete("content-type");
        headers.delete("content-length");
      }
      request = new Request(next, {
        method,
        headers,
        signal: request.signal,
        body: ["GET", "HEAD"].includes(method) ? undefined : await preserved.arrayBuffer(),
      });
    }
    throw new Error("PREVIEW_TOO_MANY_REDIRECTS");
  };
}
