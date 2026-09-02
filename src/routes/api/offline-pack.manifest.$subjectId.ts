/**
 * OFFLINE-02 — authenticated, RLS-preserving subject manifest.
 *
 * GET /api/offline-pack/manifest/{subjectId}
 */

import { createFileRoute } from "@tanstack/react-router";

import { createOfflineCaller, offlineApiError } from "@/lib/offline/offline-api.server";
import { loadOfflineAssessmentSources } from "@/lib/offline/offline-assessment-source.server";
import {
  buildOfflineSubjectPack,
  type OfflineManifestLesson,
  type OfflineTextSource,
  type OfflineTextbookSource,
} from "@/lib/offline/offline-pack-manifest";
import { isInlineHtmlResourceUrl } from "@/lib/lessons/inline-html-resource";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Gate = { managed: boolean; visible: boolean; ready_capabilities: string[] | null };
type ReadyRow = {
  lesson_id: string;
  capability: string;
  ready_hash: string | null;
  ready_at: string | null;
};

function metadataHash(metadata: unknown, key: string): string | null {
  const value = metadataString(metadata, key);
  return value?.toLowerCase() ?? null;
}

function metadataString(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

async function handle(request: Request, subjectId: string): Promise<Response> {
  if (!UUID_RE.test(subjectId)) return offlineApiError(400, "invalid_subject_id");
  const caller = await createOfflineCaller(request);
  if (caller.error) return caller.error;

  const { data: allowed, error: accessError } = await caller.supabase.rpc("can_access_subject", {
    _subject_id: subjectId,
  });
  if (accessError) return offlineApiError(500, "access_check_failed");
  if (!allowed) return offlineApiError(403, "forbidden");

  const { data: subject, error: subjectError } = await caller.supabase
    .from("subjects")
    .select("id,name,grade_id,curriculum_track_id,semester")
    .eq("id", subjectId)
    .maybeSingle();
  if (subjectError) return offlineApiError(500, "subject_lookup_failed");
  if (!subject) return offlineApiError(404, "not_found");

  const { data: lessonRows, error: lessonsError } = await caller.supabase
    .from("lessons")
    .select("id,title,sort_order,updated_at")
    .eq("subject_id", subjectId)
    .order("sort_order", { ascending: true });
  if (lessonsError) return offlineApiError(500, "lesson_lookup_failed");
  const lessonIds = (lessonRows ?? []).map((lesson) => lesson.id);

  const gates = new Map<string, Gate>();
  const gateResults = await Promise.all(
    lessonIds.map(async (lessonId) => ({
      lessonId,
      result: await caller.supabase.rpc("lesson_student_content_gate", { _lesson_id: lessonId }),
    })),
  );
  for (const { lessonId, result } of gateResults) {
    if (result.error) return offlineApiError(500, "lifecycle_gate_failed");
    const row = (Array.isArray(result.data) ? result.data[0] : result.data) as Gate | undefined;
    gates.set(lessonId, {
      managed: row?.managed === true,
      visible: row?.visible !== false,
      ready_capabilities: row?.ready_capabilities ?? [],
    });
  }

  let readyRows: ReadyRow[] = [];
  if (lessonIds.length > 0) {
    const { data, error } = await caller.supabase
      .from("lesson_capability_lifecycle")
      .select("lesson_id,capability,ready_hash,ready_at")
      .in("lesson_id", lessonIds)
      .eq("status", "READY");
    if (error) return offlineApiError(500, "lifecycle_lookup_failed");
    readyRows = (data ?? []) as ReadyRow[];
  }

  const readyByLesson = new Map<string, Record<string, { sha256: string; readyAt: string }>>();
  for (const row of readyRows) {
    if (!row.ready_hash || !row.ready_at) continue;
    const capabilities = readyByLesson.get(row.lesson_id) ?? {};
    capabilities[row.capability] = { sha256: row.ready_hash, readyAt: row.ready_at };
    readyByLesson.set(row.lesson_id, capabilities);
  }

  const lessons: OfflineManifestLesson[] = (lessonRows ?? []).map((lesson) => {
    const gate = gates.get(lesson.id);
    const readableReady = readyByLesson.get(lesson.id) ?? {};
    const gateReady = new Set(gate?.ready_capabilities ?? []);
    const readyCapabilities = Object.fromEntries(
      Object.entries(readableReady).filter(([capability]) => gateReady.has(capability)),
    );
    return {
      id: lesson.id,
      title: lesson.title,
      sortOrder: lesson.sort_order,
      updatedAt: lesson.updated_at,
      managed: gate?.managed === true,
      visible: gate?.visible !== false,
      readyCapabilities,
    };
  });

  const textSources: OfflineTextSource[] = [];
  if (lessonIds.length > 0) {
    const [books, explanations, summaries, resources] = await Promise.all([
      caller.supabase
        .from("lesson_book_contents")
        .select("id,lesson_id,content,updated_at")
        .in("lesson_id", lessonIds),
      caller.supabase
        .from("lesson_explanations")
        .select("id,lesson_id,title,content,sort_order,updated_at")
        .in("lesson_id", lessonIds),
      caller.supabase
        .from("lesson_summaries")
        .select("id,lesson_id,summary,updated_at")
        .in("lesson_id", lessonIds),
      caller.supabase
        .from("lesson_resources")
        .select(
          "id,lesson_id,title,description,url,resource_type,html_resource_type,metadata,sort_order,created_at",
        )
        .in("lesson_id", lessonIds)
        .in("resource_type", ["mindmap", "experiment"]),
    ]);
    if (books.error || explanations.error || summaries.error || resources.error) {
      return offlineApiError(500, "content_lookup_failed");
    }

    for (const row of books.data ?? []) {
      if (!row.content) continue;
      textSources.push({
        sourceType: "official-book",
        sourceId: row.id,
        lessonId: row.lesson_id,
        title: "محتوى الكتاب الرسمي",
        body: row.content,
        updatedAt: row.updated_at,
        sortOrder: 0,
        attestation: "lifecycle",
      });
    }
    for (const row of explanations.data ?? []) {
      textSources.push({
        sourceType: "tamkeen-explanation",
        sourceId: row.id,
        lessonId: row.lesson_id,
        title: row.title || "شرح تمكين",
        body: row.content,
        updatedAt: row.updated_at,
        sortOrder: row.sort_order,
        attestation: "lifecycle",
      });
    }
    for (const row of summaries.data ?? []) {
      textSources.push({
        sourceType: "quick-review",
        sourceId: row.id,
        lessonId: row.lesson_id,
        title: "المراجعة السريعة",
        body: row.summary,
        updatedAt: row.updated_at,
        sortOrder: 0,
        attestation: "lifecycle",
      });
    }
    for (const row of resources.data ?? []) {
      if (
        !row.description ||
        !isInlineHtmlResourceUrl(row.url) ||
        row.html_resource_type !== "INTERACTIVE"
      ) {
        continue;
      }
      textSources.push({
        sourceType: row.resource_type === "mindmap" ? "mind-map" : "lab-experiment",
        sourceId: row.id,
        lessonId: row.lesson_id,
        title: row.title,
        body: row.description,
        updatedAt: metadataString(row.metadata, "cf11_published_at") ?? row.created_at,
        sortOrder: row.sort_order,
        attestation: "body",
        bodySha256:
          metadataHash(row.metadata, "cf11_body_sha256") ??
          metadataHash(row.metadata, "sourceSha256"),
      });
    }
  }

  const { data: textbookRows, error: textbooksError } = await caller.supabase
    .from("subject_textbooks")
    .select(
      "id,title,file_size,sha256,updated_at,sort_order,is_active,semester,curriculum_track_id",
    )
    .eq("subject_id", subjectId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (textbooksError) return offlineApiError(500, "textbook_lookup_failed");
  const textbooks: OfflineTextbookSource[] = (textbookRows ?? [])
    .filter(
      (row) =>
        (row.semester == null || row.semester === subject.semester) &&
        (row.curriculum_track_id == null ||
          row.curriculum_track_id === subject.curriculum_track_id),
    )
    .map((row) => ({
      sourceId: row.id,
      title: row.title,
      byteSize: row.file_size ?? 0,
      sha256: row.sha256?.toLowerCase() ?? "",
      updatedAt: row.updated_at,
      sortOrder: row.sort_order,
    }));

  let assessmentSources;
  try {
    assessmentSources = await loadOfflineAssessmentSources({
      userClient: caller.supabase,
      lessons,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "OFFLINE_ASSESSMENT_BUILD_FAILED";
    const safeCode = /^OFFLINE_[A-Z0-9_]+$/.test(code) ? code : "OFFLINE_ASSESSMENT_BUILD_FAILED";
    return offlineApiError(500, safeCode);
  }

  try {
    const built = await buildOfflineSubjectPack({
      subjectTitle: subject.name,
      scope: {
        gradeId: subject.grade_id,
        curriculumTrackId: subject.curriculum_track_id,
        semester: subject.semester === 1 || subject.semester === 2 ? subject.semester : null,
        subjectId,
      },
      lessons,
      textSources,
      textbooks,
      assessmentSources,
    });
    return new Response(
      JSON.stringify({ manifest: built.manifest, omitted: built.omissions.length }),
      {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "private, no-store",
          "x-content-type-options": "nosniff",
        },
      },
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "OFFLINE_MANIFEST_FAILED";
    const safeCode = /^OFFLINE_[A-Z0-9_]+$/.test(code) ? code : "OFFLINE_MANIFEST_FAILED";
    return offlineApiError(safeCode === "OFFLINE_PACK_EMPTY" ? 422 : 409, safeCode);
  }
}

export const Route = createFileRoute("/api/offline-pack/manifest/$subjectId")({
  server: {
    handlers: {
      GET: ({ request, params }) => handle(request, params.subjectId),
    },
  },
});
