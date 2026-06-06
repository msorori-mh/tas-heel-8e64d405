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
      /\/storage\/v1\/object\/(?:public\/|sign\/|authenticated\/)?([^/]+)\/(.+)$/
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
    z.object({
      lessonId: z.string().uuid(),
      url: z.string().min(1).max(2048),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // 1) RLS-aware access check via SECURITY DEFINER RPC
    const { data: allowed, error: rpcErr } = await supabase.rpc(
      "can_access_lesson",
      { _lesson_id: data.lessonId },
    );
    if (rpcErr) throw new Error("access_check_failed");
    if (!allowed) throw new Error("forbidden");

    // 2) Verify the URL/path actually belongs to this lesson (no client-supplied paths)
    const ref = parseStorageRef(data.url);
    if (!ref) {
      // Not a managed bucket → return as-is (e.g. public YouTube)
      return { url: data.url, signed: false };
    }
    if (!ALLOWED_BUCKETS.has(ref.bucket)) {
      return { url: data.url, signed: false };
    }

    const { data: belongs, error: lkpErr } = await supabaseAdmin.rpc(
      "url_belongs_to_lesson" as never,
      { _lesson_id: data.lessonId, _url: data.url } as never,
    );
    // If the RPC isn't defined, fall back to a direct lookup.
    let ok = !lkpErr && Boolean(belongs);
    if (lkpErr) {
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
