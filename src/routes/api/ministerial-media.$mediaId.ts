/**
 * MINISTERIAL_QUESTION_MEDIA_V1 — authenticated image delivery.
 *
 * GET/HEAD /api/ministerial-media/{mediaId}?session={sessionId}
 *
 * The browser never receives a storage path or a long-lived URL. Every request
 * carries a Supabase bearer token; access is decided by the SECURITY DEFINER
 * gate `ministerial_media_can_access` (session owner, or content staff), then
 * the object is fetched through a short signed URL and streamed back with
 * nosniff + private caching. Solution images follow the same reveal rules as
 * the solution text.
 *
 * NOT under /api/public.
 */

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import {
  MINISTERIAL_MEDIA_STORAGE_KEY_RE,
  QUESTION_MEDIA_BUCKET,
  SHA256_HEX_RE,
  isMinisterialImageMime,
} from "@/lib/ministerial/ministerial-media-contract";

const SIGNED_TTL_SECONDS = 60;
const CLIENT_CACHE_SECONDS = 600;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function deny(status: number, code: string) {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

type MediaRow = {
  id: string;
  storage_path: string;
  mime_type: string;
  file_size: number | null;
  sha256: string | null;
  alt_text_ar: string | null;
};

async function authorize(request: Request, mediaId: string, sessionId: string | null) {
  const SUPABASE_URL = process.env["SUPABASE_URL"];
  const SUPABASE_PUBLISHABLE_KEY = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    return { error: deny(500, "server_misconfigured") };
  }

  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return { error: deny(401, "unauthorized") };
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return { error: deny(401, "unauthorized") };

  const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
  if (claimsError || !claims?.claims?.sub) return { error: deny(401, "unauthorized") };

  // Access gate evaluated AS THE CALLER (session ownership / content staff).
  const rpcClient = supabase as unknown as {
    rpc: (
      fn: string,
      params: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const { data: allowed, error: rpcError } = await rpcClient.rpc("ministerial_media_can_access", {
    _media_id: mediaId,
    _session_id: sessionId,
  });
  if (rpcError) return { error: deny(500, "access_check_failed") };
  // 404 (not 403) so media ids cannot be enumerated across sessions.
  if (allowed !== true) return { error: deny(404, "not_found") };

  // Admin client only after the caller passed the gate.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row, error: rowError } = await supabaseAdmin
    .from("question_media")
    .select("id, storage_path, mime_type, file_size, sha256, alt_text_ar")
    .eq("id", mediaId)
    .maybeSingle();
  if (rowError) return { error: deny(500, "lookup_failed") };
  if (!row) return { error: deny(404, "not_found") };

  const media = row as unknown as MediaRow;
  if (!MINISTERIAL_MEDIA_STORAGE_KEY_RE.test(media.storage_path)) {
    return { error: deny(422, "invalid_media_source") };
  }
  if (!isMinisterialImageMime(media.mime_type)) return { error: deny(422, "invalid_media_type") };

  return { media, supabaseAdmin };
}

async function handle(request: Request, mediaId: string, method: "GET" | "HEAD") {
  if (!UUID_RE.test(mediaId)) return deny(400, "invalid_media_id");
  const url = new URL(request.url);
  const sessionParam = url.searchParams.get("session");
  if (sessionParam && !UUID_RE.test(sessionParam)) return deny(400, "invalid_session_id");
  const sessionId = sessionParam ? sessionParam.toLowerCase() : null;

  const auth = await authorize(request, mediaId.toLowerCase(), sessionId);
  if ("error" in auth) return auth.error;

  const version =
    auth.media.sha256 && SHA256_HEX_RE.test(auth.media.sha256) ? auth.media.sha256 : auth.media.id;

  const headers = new Headers();
  headers.set("content-type", auth.media.mime_type);
  headers.set("etag", `"${version}"`);
  headers.set("x-file-sha256", version);
  // Bearer-scoped payload: browser may keep it briefly, shared caches never.
  headers.set("cache-control", `private, max-age=${CLIENT_CACHE_SECONDS}, must-revalidate`);
  headers.set("content-disposition", "inline");
  headers.set("x-content-type-options", "nosniff");
  headers.set("cross-origin-resource-policy", "same-origin");
  headers.set("vary", "authorization");

  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch.replace(/"/g, "") === version) {
    return new Response(null, { status: 304, headers });
  }

  const { data: signed, error: signError } = await auth.supabaseAdmin.storage
    .from(QUESTION_MEDIA_BUCKET)
    .createSignedUrl(auth.media.storage_path, SIGNED_TTL_SECONDS);
  if (signError || !signed?.signedUrl) return deny(502, "sign_failed");

  let upstream: Response;
  try {
    upstream = await fetch(signed.signedUrl, { method: "GET", redirect: "follow" });
  } catch {
    return deny(502, "upstream_unreachable");
  }
  if (!upstream.ok) {
    await upstream.body?.cancel();
    return deny(upstream.status === 404 ? 404 : 502, upstream.status === 404 ? "file_not_found" : "upstream_failed");
  }

  const length = upstream.headers.get("content-length");
  if (length) headers.set("content-length", length);
  else if (auth.media.file_size) headers.set("content-length", String(auth.media.file_size));

  if (method === "HEAD") {
    await upstream.body?.cancel();
    return new Response(null, { status: 200, headers });
  }
  return new Response(upstream.body, { status: 200, headers });
}

export const Route = createFileRoute("/api/ministerial-media/$mediaId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => handle(request, params.mediaId, "GET"),
      HEAD: async ({ request, params }) => handle(request, params.mediaId, "HEAD"),
    },
  },
});
