import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ALLOWED_BUCKETS = new Set(["lesson-pdfs", "lesson-videos", "receipts"]);
const SIGNED_TTL = 600;

/** Parse a stored URL or path into { bucket, path } if it points to a known private bucket. */
function parseStorageRef(input: string): { bucket: string; path: string } | null {
  if (!input) return null;
  const trimmed = input.trim();
  // Path form: "bucket/key/with/slashes"
  if (!/^https?:\/\//i.test(trimmed)) {
    const [bucket, ...rest] = trimmed.replace(/^\/+/, "").split("/");
    if (!bucket || rest.length === 0) return null;
    return { bucket, path: rest.join("/") };
  }
  try {
    const u = new URL(trimmed);
    // Supabase storage URLs:
    //   /storage/v1/object/public/<bucket>/<path>
    //   /storage/v1/object/sign/<bucket>/<path>
    //   /storage/v1/object/<bucket>/<path>
    const m = u.pathname.match(
      /\/storage\/v1\/object\/(?:public\/|sign\/|authenticated\/)?([^/]+)\/(.+)$/,
    );
    if (!m) return null;
    return { bucket: m[1], path: decodeURIComponent(m[2]) };
  } catch {
    return null;
  }
}

export const getLessonFileUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z
      .object({
        lessonId: z.string().uuid(),
        url: z.string().min(1).max(2048).optional(),
        kind: z.enum(["video", "pdf"]).optional(),
      })
      .refine((v) => !!v.url || !!v.kind, {
        message: "url_or_kind_required",
      }),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // 1) RLS-aware access check via SECURITY DEFINER RPC
    const { data: allowed, error: rpcErr } = await supabase.rpc("can_access_lesson", {
      _lesson_id: data.lessonId,
    });
    if (rpcErr) throw new Error("access_check_failed");
    if (!allowed) throw new Error("forbidden");

    // 2a) Resolve URL: prefer server-side lookup via kind so the client
    //     never has to know (or be able to read) the raw storage path.
    let resolvedUrl: string | null = data.url ?? null;
    if (!resolvedUrl && data.kind) {
      const { data: row, error: lookupErr } = await supabaseAdmin
        .from("lessons")
        .select("video_url,content_pdf_url")
        .eq("id", data.lessonId)
        .maybeSingle();
      if (lookupErr || !row) throw new Error("forbidden");
      resolvedUrl =
        data.kind === "video"
          ? (row as { video_url: string | null }).video_url
          : (row as { content_pdf_url: string | null }).content_pdf_url;
      if (!resolvedUrl) throw new Error("not_found");
    }
    if (!resolvedUrl) throw new Error("forbidden");

    // 2b) Verify the URL/path actually belongs to this lesson when the
    //     client supplied it. When resolved via kind, lookup is authoritative.
    const ref = parseStorageRef(resolvedUrl);
    if (!ref) {
      // Not a managed bucket → return as-is (e.g. public YouTube)
      return { url: resolvedUrl, signed: false };
    }
    if (!ALLOWED_BUCKETS.has(ref.bucket)) {
      return { url: resolvedUrl, signed: false };
    }

    let ok = !data.url; // when resolved via kind, already authoritative
    if (data.url) {
      const checks = await Promise.all([
        supabaseAdmin
          .from("lessons")
          .select("id")
          .eq("id", data.lessonId)
          .or(`content_pdf_url.eq.${data.url},video_url.eq.${data.url}`)
          .maybeSingle(),
        supabaseAdmin
          .from("lesson_resources")
          .select("id")
          .eq("lesson_id", data.lessonId)
          .eq("url", data.url)
          .maybeSingle(),
        supabaseAdmin
          .from("lesson_book_contents")
          .select("id")
          .eq("lesson_id", data.lessonId)
          .eq("pdf_url", data.url)
          .maybeSingle(),
      ]);
      ok = checks.some((c) => c.data);
    }
    if (!ok) throw new Error("forbidden");

    // 3) Sign
    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from(ref.bucket)
      .createSignedUrl(ref.path, SIGNED_TTL);
    if (signErr || !signed?.signedUrl) throw new Error("sign_failed");

    return { url: signed.signedUrl, signed: true, expiresIn: SIGNED_TTL };
  });
