/**
 * 18C-1 — authenticated lesson file delivery.
 *
 * GET/HEAD /api/lesson-file/{resourceId}
 *
 * The student app never talks to Google Drive (or to a private Supabase
 * bucket) directly: this route verifies access with `can_access_lesson`,
 * resolves the underlying source and streams the bytes back with caching and
 * Range metadata so the client can store a private offline copy.
 *
 * NOT under /api/public — every request must carry a Supabase bearer token.
 */

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import {
  ALLOWED_PRIVATE_BUCKETS,
  buildVersionToken,
  classifyLessonFileSource,
  parseStorageRef,
  toDriveDownloadUrl,
} from "@/lib/lessons/lesson-file-source";

const SIGNED_TTL = 600;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function deny(status: number, code: string) {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

type ResourceRow = {
  id: string;
  lesson_id: string;
  url: string;
  resource_type: string | null;
  title: string | null;
  created_at: string | null;
  metadata: unknown;
};

async function authorize(request: Request, resourceId: string) {
  const SUPABASE_URL = process.env["SUPABASE_URL"];
  const SUPABASE_PUBLISHABLE_KEY = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    return { error: deny(500, "server_misconfigured") as Response };
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

  // Admin client is only loaded after the caller is authenticated.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: row, error: rowError } = await supabaseAdmin
    .from("lesson_resources")
    .select("id, lesson_id, url, resource_type, title, created_at, metadata")
    .eq("id", resourceId)
    .maybeSingle();
  if (rowError) {
    console.error(`[lesson-file] resource lookup failed: ${rowError.message}`);
    return { error: deny(500, "lookup_failed") };
  }
  if (!row) return { error: deny(404, "not_found") };

  const resource = row as unknown as ResourceRow;

  // Track / grade / publication gate — SECURITY DEFINER RPC, evaluated as the caller.
  const { data: allowed, error: rpcError } = await supabase.rpc("can_access_lesson", {
    _lesson_id: resource.lesson_id,
  });
  if (rpcError) return { error: deny(500, "access_check_failed") };
  if (!allowed) return { error: deny(403, "forbidden") };

  return { resource, supabaseAdmin };
}

/** Resolve the fetchable upstream URL for a resource without leaking it to the client. */
type SupabaseAdmin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

async function resolveUpstream(
  resource: ResourceRow,
  supabaseAdmin: SupabaseAdmin,
): Promise<{ url: string } | { error: Response }> {
  const source = classifyLessonFileSource(resource.url);

  if (source === "SUPABASE_PRIVATE_STORAGE") {
    const ref = parseStorageRef(resource.url)!;
    if (!ALLOWED_PRIVATE_BUCKETS.has(ref.bucket)) return { error: deny(403, "forbidden") };
    const { data, error } = await supabaseAdmin.storage
      .from(ref.bucket)
      .createSignedUrl(ref.path, SIGNED_TTL);
    if (error || !data?.signedUrl) return { error: deny(502, "sign_failed") };
    return { url: data.signedUrl };
  }

  if (source === "DRIVE") {
    const url = toDriveDownloadUrl(resource.url);
    if (!url) return { error: deny(422, "invalid_source") };
    return { url };
  }

  try {
    const parsed = new URL(resource.url);
    if (parsed.protocol !== "https:") return { error: deny(422, "invalid_source") };
    return { url: parsed.toString() };
  } catch {
    return { error: deny(422, "invalid_source") };
  }
}

function guessContentType(resource: ResourceRow, upstream: string | null): string {
  if (upstream && upstream !== "application/octet-stream" && !upstream.startsWith("text/html")) {
    return upstream;
  }
  if (resource.resource_type === "video") return "video/mp4";
  return "application/pdf";
}

async function handle(request: Request, resourceId: string, method: "GET" | "HEAD") {
  if (!UUID_RE.test(resourceId)) return deny(400, "invalid_resource_id");

  const auth = await authorize(request, resourceId);
  if ("error" in auth) return auth.error;

  const resolved = await resolveUpstream(auth.resource, auth.supabaseAdmin);
  if ("error" in resolved) return resolved.error;

  const range = request.headers.get("range");
  const upstreamHeaders: Record<string, string> = {};
  if (range) upstreamHeaders["range"] = range;

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(resolved.url, {
      method: method === "HEAD" ? "GET" : method,
      headers: upstreamHeaders,
      redirect: "follow",
    });
  } catch {
    return deny(502, "upstream_unreachable");
  }

  if (!upstreamResponse.ok && upstreamResponse.status !== 206) {
    const status = upstreamResponse.status === 404 ? 404 : 502;
    console.error(
      `[lesson-file] upstream failed [${upstreamResponse.status}] resource=${resourceId}`,
    );
    return deny(status, status === 404 ? "file_not_found" : "upstream_failed");
  }

  // 18D — a direct upload / replacement bumps metadata.version so the 18C
  // offline cache treats the previous copy as STALE.
  const meta =
    auth.resource.metadata && typeof auth.resource.metadata === "object"
      ? (auth.resource.metadata as Record<string, unknown>)
      : {};
  const managedVersion = typeof meta["version"] === "string" ? (meta["version"] as string) : null;
  const version =
    managedVersion ??
    buildVersionToken(auth.resource.created_at, upstreamResponse.headers.get("etag"));
  const contentType = guessContentType(auth.resource, upstreamResponse.headers.get("content-type"));

  const headers = new Headers();
  headers.set("content-type", contentType);
  headers.set("accept-ranges", "bytes");
  headers.set("etag", `"${version}"`);
  headers.set("x-file-version", version);
  const sourceSha256 =
    typeof meta["sha256"] === "string"
      ? meta["sha256"]
      : typeof meta["source_sha256"] === "string"
        ? meta["source_sha256"]
        : null;
  if (sourceSha256 && /^[a-f0-9]{64}$/.test(sourceSha256)) {
    headers.set("x-file-sha256", sourceSha256);
  }
  // Private, per-student payload: never cached by shared proxies.
  headers.set("cache-control", "private, max-age=0, must-revalidate");
  headers.set("content-disposition", "inline");
  headers.set("x-content-type-options", "nosniff");

  const length = upstreamResponse.headers.get("content-length");
  if (length) headers.set("content-length", length);
  const contentRange = upstreamResponse.headers.get("content-range");
  if (contentRange) headers.set("content-range", contentRange);

  // Conditional request: client already holds this exact version.
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch.replace(/"/g, "") === version) {
    await upstreamResponse.body?.cancel();
    return new Response(null, { status: 304, headers });
  }

  if (method === "HEAD") {
    await upstreamResponse.body?.cancel();
    return new Response(null, { status: 200, headers });
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status === 206 ? 206 : 200,
    headers,
  });
}

export const Route = createFileRoute("/api/lesson-file/$resourceId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => handle(request, params.resourceId, "GET"),
      HEAD: async ({ request, params }) => handle(request, params.resourceId, "HEAD"),
    },
  },
});
