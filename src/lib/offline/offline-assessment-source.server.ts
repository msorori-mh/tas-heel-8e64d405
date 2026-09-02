/**
 * OFFLINE-05 — build private, student-scoped question payloads for offline use.
 *
 * Initial question rows are always resolved through the student's existing RPCs.
 * The service client is used only after that authorization boundary to attach the
 * answer layer required for local reveal/grading. No answer is returned in the
 * public manifest; the exact JSON body is delivered by the authenticated artifact
 * endpoint and stored in app-private storage.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/integrations/supabase/types";

import {
  encodeOfflineAssessmentBundle,
  type OfflineAssessmentBundle,
  type OfflineAssessmentKind,
  type OfflineQuestionOption,
  type OfflineAssessmentSource,
} from "./offline-assessment-contract";

type StudentQuestionRow = {
  id: string;
  question_text: string;
  options: unknown;
  question_type: string | null;
  sort_order: number | null;
  revision_id: string;
};

const answerLayerSchema = z
  .object({
    options: z.array(
      z
        .object({
          revisionId: z.string().uuid(),
          optionId: z.string().min(1).max(160),
          isCorrect: z.boolean(),
          sortOrder: z.number().int(),
        })
        .strict(),
    ),
    answers: z.array(
      z
        .object({
          questionId: z.string().uuid(),
          revisionId: z.string().uuid(),
          modelAnswer: z.string().nullable(),
          explanation: z.string().nullable(),
          updatedAt: z.string(),
        })
        .strict(),
    ),
    rationales: z.array(
      z
        .object({
          questionId: z.string().uuid(),
          revisionId: z.string().uuid(),
          optionId: z.string().min(1).max(160),
          whyCorrect: z.string().nullable(),
          whyWrong: z.string().nullable(),
          updatedAt: z.string(),
        })
        .strict(),
    ),
  })
  .strict();

function serviceClient(): SupabaseClient<Database> {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) throw new Error("OFFLINE_ASSESSMENT_SERVER_MISCONFIGURED");
  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

function parseOptions(value: unknown): OfflineQuestionOption[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((option, index) => {
      if (!option || typeof option !== "object") return [];
      const row = option as Record<string, unknown>;
      const id = String(row["id"] ?? row["option_code"] ?? index + 1).trim();
      const text = String(row["text"] ?? row["body"] ?? "").trim();
      const parsedOrder = Number(row["sortOrder"] ?? row["sort_order"] ?? index + 1);
      if (!id || !text) return [];
      return [
        {
          id,
          text,
          sortOrder:
            Number.isSafeInteger(parsedOrder) && parsedOrder >= 0 ? parsedOrder : index + 1,
        },
      ];
    })
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));
}

function assertOptionBinding(
  safeOptions: OfflineQuestionOption[],
  answerOptions: ReadonlyArray<{ optionId: string }>,
): void {
  const safeIds = new Set(safeOptions.map((option) => option.id));
  const answerIds = new Set(answerOptions.map((option) => option.optionId));
  if (
    safeIds.size !== safeOptions.length ||
    answerIds.size !== answerOptions.length ||
    safeIds.size !== answerIds.size ||
    [...safeIds].some((id) => !answerIds.has(id))
  ) {
    throw new Error("OFFLINE_ASSESSMENT_OPTION_BINDING_MISMATCH");
  }
}

async function loadStudentRows(
  userClient: SupabaseClient<Database>,
  lessonId: string,
  kind: OfflineAssessmentKind,
): Promise<StudentQuestionRow[]> {
  const rpc = userClient.rpc.bind(userClient) as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
  const name =
    kind === "official-questions"
      ? "get_lesson_official_questions"
      : "get_lesson_self_test_questions";
  const { data, error } = await rpc(name, { _lesson_id: lessonId });
  if (error) throw new Error("OFFLINE_ASSESSMENT_QUESTION_LOOKUP_FAILED");
  return Array.isArray(data) ? (data as StudentQuestionRow[]) : [];
}

function latestIso(values: Array<string | null | undefined>, fallback: string): string {
  let latest = Date.parse(fallback);
  for (const value of values) {
    if (!value) continue;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) latest = Math.max(latest, parsed);
  }
  if (!Number.isFinite(latest)) throw new Error("OFFLINE_ASSESSMENT_TIMESTAMP_INVALID");
  return new Date(latest).toISOString();
}

export async function loadOfflineAssessmentSource(params: {
  userClient: SupabaseClient<Database>;
  answerClient?: SupabaseClient<Database>;
  lessonId: string;
  kind: OfflineAssessmentKind;
  readyAt: string;
}): Promise<OfflineAssessmentSource | null> {
  const rows = await loadStudentRows(params.userClient, params.lessonId, params.kind);
  if (rows.length === 0) return null;

  const revisionIds = [...new Set(rows.map((row) => row.revision_id))];
  const admin = params.answerClient ?? serviceClient();
  const rpc = admin.rpc.bind(admin) as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
  const answerLayerResult = await rpc("get_offline_assessment_answer_layer", {
    _lesson_id: params.lessonId,
    _kind: params.kind,
    _revision_ids: revisionIds,
  });
  if (answerLayerResult.error) throw new Error("OFFLINE_ASSESSMENT_ANSWER_LOOKUP_FAILED");
  const answerLayer = answerLayerSchema.safeParse(answerLayerResult.data);
  if (!answerLayer.success) throw new Error("OFFLINE_ASSESSMENT_ANSWER_LAYER_INVALID");

  const optionsByRevision = new Map<
    string,
    Array<{ optionId: string; isCorrect: boolean; sortOrder: number }>
  >();
  for (const option of answerLayer.data.options) {
    const list = optionsByRevision.get(option.revisionId) ?? [];
    list.push(option);
    optionsByRevision.set(option.revisionId, list);
  }
  for (const list of optionsByRevision.values()) {
    list.sort(
      (left, right) =>
        left.sortOrder - right.sortOrder || left.optionId.localeCompare(right.optionId),
    );
  }

  const answers = new Map(
    answerLayer.data.answers.map((row) => [`${row.questionId}\u0000${row.revisionId}`, row]),
  );
  const rationales = new Map(
    answerLayer.data.rationales.map((row) => [
      `${row.questionId}\u0000${row.revisionId}\u0000${row.optionId}`,
      row,
    ]),
  );

  const orderedRows = [...rows].sort(
    (left, right) =>
      (left.sort_order ?? 0) - (right.sort_order ?? 0) || left.id.localeCompare(right.id),
  );
  let bundle: OfflineAssessmentBundle;
  if (params.kind === "official-questions") {
    bundle = {
      schemaVersion: 1,
      kind: params.kind,
      lessonId: params.lessonId,
      questions: orderedRows.map((row) => {
        const answer = answers.get(`${row.id}\u0000${row.revision_id}`);
        const options = parseOptions(row.options);
        const answerOptions = optionsByRevision.get(row.revision_id) ?? [];
        assertOptionBinding(options, answerOptions);
        const modelAnswer = answer?.modelAnswer?.trim() ?? "";
        if (!modelAnswer) throw new Error("OFFLINE_ASSESSMENT_ANSWER_MISSING");
        return {
          questionId: row.id,
          revisionId: row.revision_id,
          questionText: row.question_text,
          questionType: row.question_type ?? "SHORT_ANSWER",
          sortOrder: row.sort_order ?? 0,
          options,
          modelAnswer,
          explanation: answer?.explanation ?? null,
          correctOptionIds: answerOptions
            .filter((option) => option.isCorrect)
            .map((option) => option.optionId),
        };
      }),
    };
  } else {
    bundle = {
      schemaVersion: 1,
      kind: params.kind,
      lessonId: params.lessonId,
      questions: orderedRows.map((row) => {
        const optionRows = optionsByRevision.get(row.revision_id) ?? [];
        const options = parseOptions(row.options);
        assertOptionBinding(options, optionRows);
        const correct = optionRows.filter((option) => option.isCorrect);
        if (correct.length !== 1) throw new Error("OFFLINE_SELF_TEST_CORRECT_OPTION_INVALID");
        const feedbackByOption = Object.fromEntries(
          options.map((option) => {
            const rationale = rationales.get(`${row.id}\u0000${row.revision_id}\u0000${option.id}`);
            return [
              option.id,
              {
                whyCorrect: rationale?.whyCorrect ?? null,
                whyWrong: rationale?.whyWrong ?? null,
              },
            ];
          }),
        );
        return {
          questionId: row.id,
          revisionId: row.revision_id,
          questionText: row.question_text,
          questionType: row.question_type ?? "mcq",
          sortOrder: row.sort_order ?? 0,
          options,
          correctOptionId: correct[0].optionId,
          explanation: answers.get(`${row.id}\u0000${row.revision_id}`)?.explanation ?? null,
          feedbackByOption,
        };
      }),
    };
  }

  const body = encodeOfflineAssessmentBundle(bundle);
  return {
    sourceType: params.kind,
    lessonId: params.lessonId,
    title: params.kind === "official-questions" ? "أسئلة الكتاب" : "اختبر فهمك",
    body,
    updatedAt: latestIso(
      [
        ...answerLayer.data.answers.map((row) => row.updatedAt),
        ...answerLayer.data.rationales.map((row) => row.updatedAt),
      ],
      params.readyAt,
    ),
    sortOrder: params.kind === "official-questions" ? 0 : 1,
  };
}

export async function loadOfflineAssessmentSources(params: {
  userClient: SupabaseClient<Database>;
  lessons: ReadonlyArray<{
    id: string;
    updatedAt: string;
    managed: boolean;
    visible: boolean;
    readyCapabilities: Readonly<Record<string, { sha256: string; readyAt: string }>>;
  }>;
}): Promise<OfflineAssessmentSource[]> {
  const tasks: Array<{
    lessonId: string;
    kind: OfflineAssessmentKind;
    readyAt: string;
  }> = [];
  for (const lesson of params.lessons) {
    if (!lesson.visible) continue;
    for (const target of [
      { kind: "official-questions" as const, capability: "checkUnderstanding" },
      { kind: "self-test" as const, capability: "lessonAssessment" },
    ]) {
      const ready = lesson.readyCapabilities[target.capability];
      if (lesson.managed && !ready) continue;
      tasks.push({
        lessonId: lesson.id,
        kind: target.kind,
        readyAt: ready?.readyAt ?? lesson.updatedAt,
      });
    }
  }
  if (tasks.length === 0) return [];

  const sources: OfflineAssessmentSource[] = [];
  const answerClient = serviceClient();
  const concurrency = 6;
  for (let offset = 0; offset < tasks.length; offset += concurrency) {
    const batch = await Promise.all(
      tasks.slice(offset, offset + concurrency).map((task) =>
        loadOfflineAssessmentSource({
          userClient: params.userClient,
          answerClient,
          ...task,
        }),
      ),
    );
    for (const source of batch) if (source) sources.push(source);
  }
  return sources;
}
