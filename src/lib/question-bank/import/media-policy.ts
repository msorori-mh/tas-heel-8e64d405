const SAFE_TYPES: Record<string, string> = {
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".webp": "image",
  ".gif": "image",
  ".mp3": "audio",
  ".mp4": "video",
  ".pdf": "document",
};

export function validateMediaUrl(
  raw: unknown,
  allowHosts = ["example.edu"],
): { ok: true; url: string } | { ok: false } {
  try {
    const text = String(raw ?? "").trim();
    if (!text) return { ok: false };
    const lower = text.toLowerCase();
    if (
      lower.startsWith("file:") ||
      lower.startsWith("javascript:") ||
      lower.startsWith("data:") ||
      lower.startsWith("blob:")
    ) {
      return { ok: false };
    }
    const url = new URL(text);
    const host = url.hostname.toLowerCase();
    const privateHost =
      host === "localhost" ||
      host === "0.0.0.0" ||
      host.endsWith(".local") ||
      /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
    const allow = allowHosts.some(
      (allowed) => host === allowed || host.endsWith(`.${allowed}`),
    );
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      privateHost ||
      !allow ||
      /(?:^|[?&])(?:token|secret|key|signature|password)=/i.test(url.search) ||
      /(?:^|\/)\.\.(?:\/|$)/.test(url.pathname)
    ) {
      return { ok: false };
    }
    return { ok: true, url: url.toString() };
  } catch {
    return { ok: false };
  }
}

export function inferMediaType(url: string): string | null {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return (
      Object.entries(SAFE_TYPES).find(([extension]) => path.endsWith(extension))?.[1] ??
      null
    );
  } catch {
    return null;
  }
}
