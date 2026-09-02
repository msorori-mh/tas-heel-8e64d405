/**
 * OFFLINE-02 — authenticated delivery of exact inline bytes declared by a
 * subject pack manifest.
 *
 * GET/HEAD /api/offline-pack/artifact/{sourceType:sourceId}
 */

import { createFileRoute } from "@tanstack/react-router";

import { ANSWER_LEAK_PATTERNS } from "@/lib/lessons/html-content-standard";
import { isInlineHtmlResourceUrl } from "@/lib/lessons/inline-html-resource";
import { createOfflineCaller, offlineApiError } from "@/lib/offline/offline-api.server";
import { loadOfflineAssessmentSource } from "@/lib/offline/offline-assessment-source.server";
import {
  parseOfflineAssessmentResourceId,
  type OfflineAssessmentKind,
} from "@/lib/offline/offline-assessment-contract";
import {
  OFFLINE_SOURCE_CAPABILITY,
  parseOfflineTextResourceId,
  type OfflineTextSourceType,
} from "@/lib/offline/offline-pack-manifest";
import { sha256Hex } from "@/lib/offline/offline-pack-contract";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[a-f0-9]{64}$/;
const REMOTE_REFERENCE_RE =
  /(?:src|href)\s*=\s*["'](?:https?:)?\/\/|url\(\s*["']?(?:https?:)?\/\/|\bfetch\s*\(\s*["']https?:\/\//i;

type LoadedBody = {
  lessonId: string;
  body: string;
  updatedAt: string;
  bodySha256: string | null;
};

function assessmentCapability(kind: OfflineAssessmentKind): string {
  return kind === "official-questions" ? "checkUnderstanding" : "lessonAssessment";
}

function artifactResponse(
  request: Request,
  method: "GET" | "HEAD",
  bytes: Uint8Array,
  sha256: string,
  contentType: string,
): Response {
  const headers = new Headers({
    "content-type": contentType,
    "content-length": String(bytes.byteLength),
    "cache-control": "private, max-age=0, must-revalidate",
    "x-content-type-options": "nosniff",
    "x-file-sha256": sha256,
    "x-file-version": sha256,
    etag: `"${sha256}"`,
  });
  if (request.headers.get("if-none-match")?.replace(/"/g, "") === sha256) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(
    method === "HEAD" ? null : new Blob([Uint8Array.from(bytes)], { type: contentType }),
    { status: 200, headers },
  );
}

async function handleAssessment(
  request: Request,
  resourceId: string,
  method: "GET" | "HEAD",
): Promise<Response> {
  let parsed: ReturnType<typeof parseOfflineAssessmentResourceId>;
  try {
    parsed = parseOfflineAssessmentResourceId(resourceId);
  } catch {
    return offlineApiError(400, "invalid_resource_id");
  }
  if (!UUID_RE.test(parsed.lessonId)) return offlineApiError(400, "invalid_resource_id");

  const caller = await createOfflineCaller(request);
  if (caller.error) return caller.error;
  const { data: allowed, error: accessError } = await caller.supabase.rpc("can_access_lesson", {
    _lesson_id: parsed.lessonId,
  });
  if (accessError) return offlineApiError(500, "access_check_failed");
  if (!allowed) return offlineApiError(403, "forbidden");

  const { data: gateData, error: gateError } = await caller.supabase.rpc(
    "lesson_student_content_gate",
    { _lesson_id: parsed.lessonId },
  );
  if (gateError) return offlineApiError(500, "lifecycle_gate_failed");
  const gate = (Array.isArray(gateData) ? gateData[0] : gateData) as
    | { managed: boolean; visible: boolean; ready_capabilities: string[] | null }
    | undefined;
  if (gate?.visible === false) return offlineApiError(404, "not_found");
  const capability = assessmentCapability(parsed.kind);
  if (gate?.managed === true && !(gate.ready_capabilities ?? []).includes(capability)) {
    return offlineApiError(404, "not_found");
  }

  const { data: lifecycle, error: lifecycleError } = await caller.supabase
    .from("lesson_capability_lifecycle")
    .select("ready_at")
    .eq("lesson_id", parsed.lessonId)
    .eq("capability", capability)
    .eq("status", "READY")
    .maybeSingle();
  if (lifecycleError) return offlineApiError(500, "lifecycle_lookup_failed");

  let source;
  try {
    source = await loadOfflineAssessmentSource({
      userClient: caller.supabase,
      lessonId: parsed.lessonId,
      kind: parsed.kind,
      readyAt: lifecycle?.ready_at ?? "1970-01-01T00:00:00.000Z",
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "OFFLINE_ASSESSMENT_BUILD_FAILED";
    return offlineApiError(
      500,
      /^OFFLINE_[A-Z0-9_]+$/.test(code) ? code : "OFFLINE_ASSESSMENT_BUILD_FAILED",
    );
  }
  if (!source) return offlineApiError(404, "not_found");
  const observedSha256 = await sha256Hex(source.body);
  return artifactResponse(
    request,
    method,
    source.body,
    observedSha256,
    "application/json; charset=utf-8",
  );
}

function metadataValue(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

async function loadBody(
  sourceType: OfflineTextSourceType,
  sourceId: string,
  caller: Awaited<ReturnType<typeof createOfflineCaller>> & { error?: never },
): Promise<LoadedBody | null> {
  if (sourceType === "official-book") {
    const { data, error } = await caller.supabase
      .from("lesson_book_contents")
      .select("lesson_id,content,updated_at")
      .eq("id", sourceId)
      .maybeSingle();
    if (error) throw new Error("OFFLINE_ARTIFACT_LOOKUP_FAILED");
    return data?.content
      ? {
          lessonId: data.lesson_id,
          body: data.content,
          updatedAt: data.updated_at,
          bodySha256: null,
        }
      : null;
  }
  if (sourceType === "tamkeen-explanation") {
    const { data, error } = await caller.supabase
      .from("lesson_explanations")
      .select("lesson_id,content,updated_at")
      .eq("id", sourceId)
      .maybeSingle();
    if (error) throw new Error("OFFLINE_ARTIFACT_LOOKUP_FAILED");
    return data
      ? {
          lessonId: data.lesson_id,
          body: data.content,
          updatedAt: data.updated_at,
          bodySha256: null,
        }
      : null;
  }
  if (sourceType === "quick-review") {
    const { data, error } = await caller.supabase
      .from("lesson_summaries")
      .select("lesson_id,summary,updated_at")
      .eq("id", sourceId)
      .maybeSingle();
    if (error) throw new Error("OFFLINE_ARTIFACT_LOOKUP_FAILED");
    return data
      ? {
          lessonId: data.lesson_id,
          body: data.summary,
          updatedAt: data.updated_at,
          bodySha256: null,
        }
      : null;
  }

  const expectedType = sourceType === "mind-map" ? "mindmap" : "experiment";
  const { data, error } = await caller.supabase
    .from("lesson_resources")
    .select("lesson_id,description,url,resource_type,html_resource_type,metadata,created_at")
    .eq("id", sourceId)
    .eq("resource_type", expectedType)
    .maybeSingle();
  if (error) throw new Error("OFFLINE_ARTIFACT_LOOKUP_FAILED");
  if (
    !data?.description ||
    !isInlineHtmlResourceUrl(data.url) ||
    data.html_resource_type !== "INTERACTIVE"
  ) {
    return null;
  }
  return {
    lessonId: data.lesson_id,
    body: data.description,
    updatedAt: metadataValue(data.metadata, "cf11_published_at") ?? data.created_at,
    bodySha256:
      metadataValue(data.metadata, "cf11_body_sha256") ??
      metadataValue(data.metadata, "sourceSha256"),
  };
}

async function handle(
  request: Request,
  resourceId: string,
  method: "GET" | "HEAD",
): Promise<Response> {
  if (resourceId.startsWith("official-questions:") || resourceId.startsWith("self-test:")) {
    return handleAssessment(request, resourceId, method);
  }
  let parsed: ReturnType<typeof parseOfflineTextResourceId>;
  try {
    parsed = parseOfflineTextResourceId(resourceId);
  } catch {
    return offlineApiError(400, "invalid_resource_id");
  }
  if (!UUID_RE.test(parsed.sourceId)) return offlineApiError(400, "invalid_resource_id");

  const caller = await createOfflineCaller(request);
  if (caller.error) return caller.error;
  let loaded: LoadedBody | null;
  try {
    loaded = await loadBody(parsed.sourceType, parsed.sourceId, caller);
  } catch {
    return offlineApiError(500, "artifact_lookup_failed");
  }
  if (!loaded) return offlineApiError(404, "not_found");

  const { data: allowed, error: accessError } = await caller.supabase.rpc("can_access_lesson", {
    _lesson_id: loaded.lessonId,
  });
  if (accessError) return offlineApiError(500, "access_check_failed");
  if (!allowed) return offlineApiError(403, "forbidden");

  const { data: gateData, error: gateError } = await caller.supabase.rpc(
    "lesson_student_content_gate",
    { _lesson_id: loaded.lessonId },
  );
  if (gateError) return offlineApiError(500, "lifecycle_gate_failed");
  const gate = (Array.isArray(gateData) ? gateData[0] : gateData) as
    | { managed: boolean; visible: boolean; ready_capabilities: string[] | null }
    | undefined;
  if (gate?.visible === false) return offlineApiError(404, "not_found");

  const capability = OFFLINE_SOURCE_CAPABILITY[parsed.sourceType];
  const readyCapabilities = new Set(gate?.ready_capabilities ?? []);
  if (gate?.managed === true && !readyCapabilities.has(capability)) {
    return offlineApiError(404, "not_found");
  }

  const bytes = new TextEncoder().encode(loaded.body);
  const observedSha256 = await sha256Hex(bytes);
  if (ANSWER_LEAK_PATTERNS.some((pattern) => pattern.test(loaded.body))) {
    return offlineApiError(409, "OFFLINE_ANSWER_LEAK_DETECTED");
  }
  if (REMOTE_REFERENCE_RE.test(loaded.body)) {
    return offlineApiError(409, "OFFLINE_REMOTE_DEPENDENCY");
  }

  if (parsed.sourceType === "mind-map" || parsed.sourceType === "lab-experiment") {
    const expected = loaded.bodySha256?.toLowerCase() ?? "";
    if (!SHA256_RE.test(expected) || expected !== observedSha256) {
      return offlineApiError(409, "OFFLINE_SOURCE_BODY_HASH_MISMATCH");
    }
  } else if (gate?.managed === true) {
    const { data: lifecycle, error: lifecycleError } = await caller.supabase
      .from("lesson_capability_lifecycle")
      .select("ready_hash")
      .eq("lesson_id", loaded.lessonId)
      .eq("capability", capability)
      .eq("status", "READY")
      .maybeSingle();
    if (lifecycleError) return offlineApiError(500, "lifecycle_lookup_failed");
    if (!lifecycle?.ready_hash || lifecycle.ready_hash !== observedSha256) {
      return offlineApiError(409, "OFFLINE_SOURCE_READY_HASH_MISMATCH");
    }
  }

  return artifactResponse(request, method, bytes, observedSha256, "text/html; charset=utf-8");
}

export const Route = createFileRoute("/api/offline-pack/artifact/$resourceId")({
  server: {
    handlers: {
      GET: ({ request, params }) => handle(request, params.resourceId, "GET"),
      HEAD: ({ request, params }) => handle(request, params.resourceId, "HEAD"),
    },
  },
});
