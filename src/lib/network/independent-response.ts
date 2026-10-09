/** No account data or server secret is exposed by this deployment proof. */
export function independentResponse(response: Response) {
  if (import.meta.env.VITE_INDEPENDENT_STAGING !== "true") return response;
  const headers = new Headers(response.headers);
  headers.set("X-Tamkeen-Environment", "independent-staging");
  headers.set("X-Robots-Tag", "noindex, nofollow");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  if (headers.get("content-type")?.includes("text/html")) {
    headers.set(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' data: https://fonts.gstatic.com",
        "connect-src 'self' https://yjpirilbpqxtmnayruht.supabase.co wss://yjpirilbpqxtmnayruht.supabase.co",
        "img-src 'self' data: blob: https://yjpirilbpqxtmnayruht.supabase.co https://lh3.googleusercontent.com",
        "media-src 'self' blob: https://yjpirilbpqxtmnayruht.supabase.co",
        "frame-src 'self' blob: https://phet.colorado.edu https://www.youtube.com https://www.youtube-nocookie.com",
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
      ].join("; "),
    );
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
