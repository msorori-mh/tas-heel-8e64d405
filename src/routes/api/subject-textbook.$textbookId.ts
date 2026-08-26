/**
 * 21B — authenticated subject-textbook delivery.
 *
 * GET/HEAD /api/subject-textbook/{textbookId}
 *
 * Same contract as the 18C lesson-file route (bearer token, x-file-version,
 * Range, private cache headers) so the existing offline cache and the native
 * Android renderer work unchanged. Authorisation is delegated to RLS: the row
 * is read with the CALLER's token, so grade / track / subject gates apply and
 * a textbook can never widen access.
 *
 * NOT under /api/public.
 */

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

const SIGNED_TTL = 600;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_BUCKETS = new Set(["lesson-pdfs"]);

function deny(status: number, code: string) {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

type TextbookRow = {
  id: string;
  storage_bucket: string;
  storage_path: string;
  version: string;
  is_active: boolean;
};

async function handle(request: Request, textbookId: string, method: "GET" | "HEAD") {
  if (!UUID_RE.test(textbookId)) return deny(400, "invalid_textbook_id");

  const SUPABASE_URL = process.env["SUPABASE_URL"];
  const SUPABASE_PUBLISHABLE_KEY = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return deny(500, "server_misconfigured");

  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return deny(401, "unauthorized");
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return deny(401, "unauthorized");

  const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });

  const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
  if (claimsError || !claims?.claims?.sub) return deny(401, "unauthorized");

  // RLS-gated read as the caller — fail closed.
  const { data, error } = await (
    supabase as never as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (
            c: string,
            v: string,
          ) => {
            maybeSingle: () => Promise<{
              data: TextbookRow | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    }
  )
    .from("subject_textbooks")
    .select("id, storage_bucket, storage_path, version, is_active")
    .eq("id", textbookId)
    .maybeSingle();

  if (error) return deny(500, "lookup_failed");
  if (!data || !data.is_active) return deny(404, "not_found");
  if (!ALLOWED_BUCKETS.has(data.storage_bucket)) return deny(403, "forbidden");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: signed, error: signError } = await supabaseAdmin.storage
    .from(data.storage_bucket)
    .createSignedUrl(data.storage_path, SIGNED_TTL);
  if (signError || !signed?.signedUrl) return deny(502, "sign_failed");

  const range = request.headers.get("range");
  let upstream: Response;
  try {
    upstream = await fetch(signed.signedUrl, {
      method: "GET",
      headers: range ? { range } : {},
      redirect: "follow",
    });
  } catch {
    return deny(502, "upstream_unreachable");
  }
  if (!upstream.ok && upstream.status !== 206) {
    return deny(upstream.status === 404 ? 404 : 502, "upstream_failed");
  }

  const version = data.version;
  const headers = new Headers();
  headers.set("content-type", "application/pdf");
  headers.set("accept-ranges", "bytes");
  headers.set("etag", `"${version}"`);
  headers.set("x-file-version", version);
  headers.set("cache-control", "private, max-age=0, must-revalidate");
  headers.set("content-disposition", "inline");
  headers.set("x-content-type-options", "nosniff");

  const length = upstream.headers.get("content-length");
  if (length) headers.set("content-length", length);
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) headers.set("content-range", contentRange);

  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch.replace(/"/g, "") === version) {
    await upstream.body?.cancel();
    return new Response(null, { status: 304, headers });
  }

  if (method === "HEAD") {
    await upstream.body?.cancel();
    return new Response(null, { status: 200, headers });
  }

  return new Response(upstream.body, {
    status: upstream.status === 206 ? 206 : 200,
    headers,
  });
}

export const Route = createFileRoute("/api/subject-textbook/$textbookId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => handle(request, params.textbookId, "GET"),
      HEAD: async ({ request, params }) => handle(request, params.textbookId, "HEAD"),
    },
  },
});
