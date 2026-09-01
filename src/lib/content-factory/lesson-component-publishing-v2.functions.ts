import { createHash, randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  requireContentStaffAuth,
  type ContentStaffAuthContext,
} from "@/integrations/supabase/auth-middleware";
import type { GoldenCapability } from "./golden-lesson-contract";
import { GOLDEN_CAPABILITIES } from "./golden-lesson-contract";
import { GOLDEN_LIFECYCLE_TARGETS } from "./golden-lesson-domain-staging";
import { GOLDEN_DIRECT_BUCKET } from "./golden-lesson-direct-storage";
import {
  GOLDEN_ARTIFACT_MAX_BYTES,
  validateGoldenLessonAnswerCoverage,
  validateGoldenLessonArtifactBytes,
} from "./golden-lesson-file-contract";

const Capability = z.enum([
  "officialBookContent",
  "tamkeenExplanationHtml",
  "lessonSummaryHtml",
  "mindMapHtml",
  "labExperimentHtml",
  "officialBookQuestions",
  "selfTest",
]);

const FileDeclaration = z.object({
  fileName: z.string().min(1).max(255),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().min(1).max(GOLDEN_ARTIFACT_MAX_BYTES),
  mimeType: z.string().min(1).max(120),
});

const LabExperimentInstance = z.object({
  instanceIndex: z.number().int().min(0).max(98),
  instanceCount: z.number().int().min(1).max(99),
  instanceTitle: z.string().trim().min(1).max(120).nullable().optional(),
});

const CreateInput = z
  .object({
    lessonCode: z.string().min(1).max(160),
    capability: Capability,
    source: FileDeclaration,
    answers: FileDeclaration.optional(),
    labExperiment: LabExperimentInstance.optional(),
  })
  .superRefine((value, context) => {
    if (value.capability !== "labExperimentHtml" && value.labExperiment) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["labExperiment"],
        message: "LCPV2_LAB_INSTANCE_FORBIDDEN",
      });
    }
    if (
      value.labExperiment &&
      value.labExperiment.instanceIndex >= value.labExperiment.instanceCount
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["labExperiment", "instanceIndex"],
        message: "LCPV2_LAB_INSTANCE_RANGE_INVALID",
      });
    }
  });

const VerifyInput = z.object({ intakeId: z.string().uuid() });
const PublishInput = z.object({ intakeId: z.string().uuid() });
const PublicationStatusInput = z.object({ lessonCode: z.string().min(1).max(160) });

type RpcResult = { data: unknown; error: { message: string } | null };
type Rpc = (name: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;

interface IntakeRow {
  id: string;
  lesson_id: string;
  capability: GoldenCapability;
  original_file_name: string;
  storage_path: string;
  source_sha256: string;
  source_bytes: number;
  answer_file_name: string | null;
  answer_storage_path: string | null;
  answer_sha256: string | null;
  answer_bytes: number | null;
  status: string;
  created_by: string;
  validation_summary: unknown;
}

export interface LessonComponentV2UploadSlot {
  intakeId: string;
  bucket: string;
  uploads: Array<{
    kind: "source" | "answers";
    storagePath: string;
    token: string;
  }>;
}

export interface LessonComponentV2Verification {
  intakeId: string;
  lessonId: string;
  capability: GoldenCapability;
  sourceSha256: string;
  status: "VERIFIED";
  idempotent: boolean;
}

export interface LessonComponentV2Publication {
  intakeId: string;
  lessonId: string;
  capability: GoldenCapability;
  lifecycleCapability: string;
  publicationVersion: number;
  sourceSha256: string;
  status: "READY";
  studentCanSeeThisComponent: true;
  idempotent: boolean;
  writesPerformed: number;
  resourceCode?: string;
  instanceIndex?: number;
  instanceCount?: number;
  instanceTitle?: string | null;
  steps: Array<{ key: "upload" | "verify" | "publish"; label: string; detail: string }>;
}

export interface LessonComponentServerPublicationStatus {
  lessonId: string;
  capability: GoldenCapability;
  lifecycleCapability: string;
  publicationVersion: number | null;
  sourceSha256: string | null;
  publishedAt: string | null;
  visibleToStudent: true;
  resourceCode?: string;
  instanceIndex?: number;
  instanceTitle?: string | null;
  sortOrder?: number;
}

function adminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("LCPV2_SERVER_NOT_CONFIGURED");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function assertRpc(result: RpcResult, code: string): Record<string, unknown> {
  if (result.error) throw new Error(`${code}: ${result.error.message}`);
  if (!result.data) throw new Error(`${code}: EMPTY_RESPONSE`);
  return result.data as Record<string, unknown>;
}

function safeLeaf(name: string): boolean {
  const hasControlCharacter = Array.from(name).some((character) => character.charCodeAt(0) < 32);
  return (
    name.length > 0 &&
    name.length <= 255 &&
    name !== "." &&
    name !== ".." &&
    !name.includes("/") &&
    !name.includes("\\") &&
    !hasControlCharacter &&
    name.normalize("NFC") === name
  );
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function requireExactBytes(
  bytes: Uint8Array,
  expectedBytes: number,
  expectedSha256: string,
  code: string,
) {
  if (bytes.byteLength !== expectedBytes) throw new Error(`${code}_SIZE_MISMATCH`);
  if (sha256(bytes) !== expectedSha256) throw new Error(`${code}_HASH_MISMATCH`);
}

function assertSelfContainedHtml(fileName: string, textValue: string) {
  if (!/\.html$/i.test(fileName)) return;
  const attributeReferences = textValue.matchAll(
    /<(?:img|script|link|source|video|audio|iframe|object|embed)\b[^>]*\b(src|href|poster|srcset)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
  );
  for (const match of attributeReferences) {
    const attribute = (match[1] ?? "").toLowerCase();
    const rawValue = (match[2] ?? match[3] ?? match[4] ?? "").trim();
    const values =
      attribute === "srcset"
        ? rawValue.split(",").map((candidate) => candidate.trim().split(/\s+/, 1)[0] ?? "")
        : [rawValue];
    for (const value of values) {
      if (value && !value.startsWith("data:") && !value.startsWith("#")) {
        throw new Error("LCPV2_HTML_DETACHED_RESOURCE:" + value.slice(0, 160));
      }
    }
  }
  for (const match of textValue.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
    const value = (match[1] ?? "").trim();
    if (value && !value.startsWith("data:") && !value.startsWith("#")) {
      throw new Error(`LCPV2_CSS_DETACHED_RESOURCE:${value.slice(0, 160)}`);
    }
  }
}

async function download(storagePath: string): Promise<Uint8Array> {
  const result = await adminClient().storage.from(GOLDEN_DIRECT_BUCKET).download(storagePath);
  if (result.error || !result.data) {
    throw new Error(result.error?.message ?? "LCPV2_FILE_DOWNLOAD_FAILED");
  }
  return new Uint8Array(await result.data.arrayBuffer());
}

export const createLessonComponentV2Upload = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator((input) => CreateInput.parse(input))
  .handler(async ({ data, context }): Promise<LessonComponentV2UploadSlot> => {
    const { userId, isFullAdmin } = context as ContentStaffAuthContext;
    if (!isFullAdmin) throw new Error("LCPV2_FULL_ADMIN_REQUIRED");
    if (!safeLeaf(data.source.fileName)) throw new Error("LCPV2_SOURCE_NAME_UNSAFE");
    const questionComponent =
      data.capability === "officialBookQuestions" || data.capability === "selfTest";
    if (questionComponent !== Boolean(data.answers)) throw new Error("LCPV2_ANSWER_FILE_SHAPE");
    if (data.answers && !safeLeaf(data.answers.fileName)) {
      throw new Error("LCPV2_ANSWER_NAME_UNSAFE");
    }

    const uploadNonce = randomUUID();
    const base = `${userId}/v2/${uploadNonce}`;
    const sourcePath = `${base}/source${data.source.fileName.toLowerCase().endsWith(".json") ? ".json" : ".html"}`;
    const answerPath = data.answers ? `${base}/answers.server-only.json` : null;
    const admin = adminClient();
    const sourceSigned = await admin.storage
      .from(GOLDEN_DIRECT_BUCKET)
      .createSignedUploadUrl(sourcePath);
    if (sourceSigned.error || !sourceSigned.data?.token) {
      throw new Error(sourceSigned.error?.message ?? "LCPV2_SOURCE_UPLOAD_TOKEN_MISSING");
    }
    let answerToken: string | null = null;
    if (answerPath) {
      const answerSigned = await admin.storage
        .from(GOLDEN_DIRECT_BUCKET)
        .createSignedUploadUrl(answerPath);
      if (answerSigned.error || !answerSigned.data?.token) {
        throw new Error(answerSigned.error?.message ?? "LCPV2_ANSWER_UPLOAD_TOKEN_MISSING");
      }
      answerToken = answerSigned.data.token;
    }

    const created = assertRpc(
      await (admin as unknown as { rpc: Rpc }).rpc("lesson_component_create_intake_v2", {
        _lesson_code: data.lessonCode,
        _capability: data.capability,
        _original_file_name: data.source.fileName,
        _storage_path: sourcePath,
        _source_sha256: data.source.sha256,
        _source_bytes: data.source.bytes,
        _mime_type: data.source.mimeType,
        _answer_file_name: data.answers?.fileName ?? null,
        _answer_storage_path: answerPath,
        _answer_sha256: data.answers?.sha256 ?? null,
        _answer_bytes: data.answers?.bytes ?? null,
        _actor_id: userId,
      }),
      "LCPV2_CREATE_FAILED",
    );
    const intakeId = String(created["intake_id"]);
    if (data.capability === "labExperimentHtml") {
      const labExperiment = data.labExperiment ?? {
        instanceIndex: 0,
        instanceCount: 1,
        instanceTitle: null,
      };
      const metadataUpdate = await admin
        .from("lesson_component_intakes_v2")
        .update({ validation_summary: { labExperiment } })
        .eq("id", intakeId)
        .eq("status", "UPLOADING")
        .select("id")
        .single();
      if (metadataUpdate.error || !metadataUpdate.data) {
        throw new Error(
          `LCPV2_LAB_INSTANCE_PERSIST_FAILED: ${metadataUpdate.error?.message ?? "INTAKE_NOT_UPLOADING"}`,
        );
      }
    }

    return {
      intakeId,
      bucket: GOLDEN_DIRECT_BUCKET,
      uploads: [
        { kind: "source", storagePath: sourcePath, token: sourceSigned.data.token },
        ...(answerPath && answerToken
          ? [{ kind: "answers" as const, storagePath: answerPath, token: answerToken }]
          : []),
      ],
    };
  });

export const verifyLessonComponentV2Upload = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator((input) => VerifyInput.parse(input))
  .handler(async ({ data, context }): Promise<LessonComponentV2Verification> => {
    const { userId, isFullAdmin } = context as ContentStaffAuthContext;
    if (!isFullAdmin) throw new Error("LCPV2_FULL_ADMIN_REQUIRED");
    const admin = adminClient();
    const query = await admin
      .from("lesson_component_intakes_v2")
      .select(
        "id,lesson_id,capability,original_file_name,storage_path,source_sha256,source_bytes,answer_file_name,answer_storage_path,answer_sha256,answer_bytes,status,created_by,validation_summary",
      )
      .eq("id", data.intakeId)
      .single();
    if (query.error || !query.data) {
      throw new Error(query.error?.message ?? "LCPV2_INTAKE_NOT_FOUND");
    }
    const intake = query.data as unknown as IntakeRow;
    if (intake.created_by !== userId) throw new Error("LCPV2_INTAKE_OWNER_MISMATCH");
    if (intake.status === "PUBLISHED") throw new Error("LCPV2_INTAKE_ALREADY_PUBLISHED");

    try {
      const rawValidationSummary =
        intake.validation_summary && typeof intake.validation_summary === "object"
          ? (intake.validation_summary as Record<string, unknown>)
          : {};
      const labExperiment =
        intake.capability === "labExperimentHtml"
          ? LabExperimentInstance.parse(
              rawValidationSummary["labExperiment"] ?? {
                instanceIndex: 0,
                instanceCount: 1,
                instanceTitle: null,
              },
            )
          : null;
      const sourceBytes = await download(intake.storage_path);
      requireExactBytes(
        sourceBytes,
        Number(intake.source_bytes),
        intake.source_sha256,
        "LCPV2_SOURCE",
      );
      const validation = validateGoldenLessonArtifactBytes(
        intake.capability,
        intake.original_file_name,
        sourceBytes,
      );
      if (!validation.valid) {
        throw new Error(validation.findings[0]?.code ?? "LCPV2_SOURCE_INVALID");
      }
      const sourceText = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
        sourceBytes,
      );
      assertSelfContainedHtml(intake.original_file_name, sourceText);

      let answerBytes: Uint8Array | null = null;
      if (intake.answer_storage_path && intake.answer_sha256 && intake.answer_bytes) {
        answerBytes = await download(intake.answer_storage_path);
        requireExactBytes(
          answerBytes,
          Number(intake.answer_bytes),
          intake.answer_sha256,
          "LCPV2_ANSWERS",
        );
      }
      const coverage = validateGoldenLessonAnswerCoverage(
        {
          [intake.capability]: {
            fileName: intake.original_file_name,
            bytes: sourceBytes,
          },
        },
        answerBytes && intake.answer_file_name
          ? { fileName: intake.answer_file_name, bytes: answerBytes }
          : null,
      );
      if (!coverage.valid) {
        throw new Error(coverage.findings[0]?.code ?? "LCPV2_ANSWER_COVERAGE_INVALID");
      }

      // Preserve an optional UTF-8 BOM so hashing the stored text in PostgreSQL still
      // represents exactly the bytes that passed the server-side SHA-256 check.
      const answersPayload = answerBytes
        ? (JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(answerBytes)) as object)
        : null;
      const verified = assertRpc(
        await (admin as unknown as { rpc: Rpc }).rpc("lesson_component_verify_intake_v2", {
          _intake_id: intake.id,
          _payload_text: sourceText,
          _answers_payload: answersPayload,
          _validation_summary: {
            validator: "LCPV2_SERVER",
            sourceSha256: intake.source_sha256,
            sourceBytes: sourceBytes.byteLength,
            answerSha256: intake.answer_sha256,
            answerBytes: answerBytes?.byteLength ?? null,
            ...(labExperiment ? { labExperiment } : {}),
          },
          _actor_id: userId,
        }),
        "LCPV2_VERIFY_FAILED",
      );
      return {
        intakeId: String(verified["intake_id"]),
        lessonId: String(verified["lesson_id"]),
        capability: String(verified["capability"]) as GoldenCapability,
        sourceSha256: String(verified["source_sha256"]),
        status: "VERIFIED",
        idempotent: Boolean(verified["idempotent"]),
      };
    } catch (error) {
      await admin
        .from("lesson_component_intakes_v2")
        .update({
          status: "REJECTED",
          rejected_at: new Date().toISOString(),
          rejection_code:
            error instanceof Error ? error.message.slice(0, 500) : "LCPV2_VERIFY_FAILED",
        })
        .eq("id", intake.id)
        .eq("status", "UPLOADING");
      throw error;
    }
  });

export const publishLessonComponentV2 = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator((input) => PublishInput.parse(input))
  .handler(async ({ data, context }): Promise<LessonComponentV2Publication> => {
    const { supabase, isFullAdmin } = context as ContentStaffAuthContext;
    if (!isFullAdmin) throw new Error("LCPV2_FULL_ADMIN_REQUIRED");
    const published = assertRpc(
      await (supabase as unknown as { rpc: Rpc }).rpc("lesson_component_publish_v2", {
        _intake_id: data.intakeId,
        _idempotency_key: `lcpv2:${data.intakeId}:publish`,
      }),
      "LCPV2_PUBLISH_FAILED",
    );
    if (published["student_can_see_this_component"] !== true) {
      throw new Error("LCPV2_COMPONENT_NOT_VISIBLE");
    }
    return {
      intakeId: String(published["intake_id"]),
      lessonId: String(published["lesson_id"]),
      capability: String(published["capability"]) as GoldenCapability,
      lifecycleCapability: String(published["lifecycle_capability"]),
      publicationVersion: Number(published["publication_version"]),
      sourceSha256: String(published["source_sha256"]),
      status: "READY",
      studentCanSeeThisComponent: true,
      idempotent: Boolean(published["idempotent"]),
      writesPerformed: Number(published["writes_performed"]),
      ...(published["resource_code"] ? { resourceCode: String(published["resource_code"]) } : {}),
      ...(published["instance_index"] !== undefined
        ? { instanceIndex: Number(published["instance_index"]) }
        : {}),
      ...(published["instance_count"] !== undefined
        ? { instanceCount: Number(published["instance_count"]) }
        : {}),
      ...(published["instance_title"] !== undefined
        ? {
            instanceTitle:
              published["instance_title"] === null ? null : String(published["instance_title"]),
          }
        : {}),
      steps: [
        { key: "upload", label: "رفع الملف", detail: "تم" },
        { key: "verify", label: "فحص الملف", detail: "تم" },
        { key: "publish", label: "نشر المكوّن", detail: "تم — ظاهر للطلاب الآن" },
      ],
    };
  });

/** Read-only server truth for the seven components currently visible to students. */
export const getLessonComponentServerPublicationStatus = createServerFn({ method: "GET" })
  .middleware([requireContentStaffAuth])
  .inputValidator((input) => PublicationStatusInput.parse(input))
  .handler(async ({ data, context }): Promise<LessonComponentServerPublicationStatus[]> => {
    const { isFullAdmin } = context as ContentStaffAuthContext;
    if (!isFullAdmin) throw new Error("LCPV2_FULL_ADMIN_REQUIRED");
    const admin = adminClient();
    const lesson = await admin
      .from("lessons")
      .select("id,slug")
      .eq("slug", data.lessonCode)
      .maybeSingle();
    if (lesson.error) throw new Error(`LCPV2_STATUS_LESSON_READ_FAILED: ${lesson.error.message}`);
    if (!lesson.data) throw new Error("LCPV2_STATUS_LESSON_NOT_FOUND");
    const lessonId = lesson.data.id;

    const [lifecycleResult, publicationResult, experimentResult] = await Promise.all([
      admin
        .from("lesson_capability_lifecycle")
        .select("capability,status,ready_hash,ready_at")
        .eq("lesson_id", lessonId),
      admin
        .from("lesson_component_publications_v2")
        .select(
          "capability,lifecycle_capability,publication_version,source_sha256,published_at,result",
        )
        .eq("lesson_id", lessonId)
        .order("publication_version", { ascending: false }),
      admin
        .from("lesson_resources")
        .select("resource_code,title,sort_order,metadata")
        .eq("lesson_id", lessonId)
        .eq("resource_type", "experiment")
        .order("sort_order", { ascending: true }),
    ]);
    if (lifecycleResult.error) {
      throw new Error(`LCPV2_STATUS_LIFECYCLE_READ_FAILED: ${lifecycleResult.error.message}`);
    }
    if (publicationResult.error) {
      throw new Error(`LCPV2_STATUS_PUBLICATION_READ_FAILED: ${publicationResult.error.message}`);
    }
    if (experimentResult.error) {
      throw new Error(`LCPV2_STATUS_EXPERIMENT_READ_FAILED: ${experimentResult.error.message}`);
    }

    const lifecycleByCapability = new Map(
      (lifecycleResult.data ?? []).map((row) => [String(row.capability), row]),
    );
    const latestPublication = new Map<GoldenCapability, (typeof publicationResult.data)[number]>();
    for (const row of publicationResult.data ?? []) {
      const capability = String(row.capability) as GoldenCapability;
      if (!latestPublication.has(capability)) latestPublication.set(capability, row);
    }

    const lessonCode = String(lesson.data.slug).toUpperCase();
    const managedExperiments = (experimentResult.data ?? []).flatMap((row) => {
      const resourceCode = String(row.resource_code ?? "").toUpperCase();
      const legacy = resourceCode === `${lessonCode}-EXPERIMENT`;
      const numbered = new RegExp(
        `^${lessonCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-LAB-(\\d{2})$`,
      ).exec(resourceCode);
      if (!legacy && !numbered) return [];
      const instanceIndex = legacy ? 0 : Number(numbered![1]) - 1;
      if (!Number.isInteger(instanceIndex) || instanceIndex < 0 || instanceIndex > 98) return [];
      const metadata =
        row.metadata && typeof row.metadata === "object"
          ? (row.metadata as Record<string, unknown>)
          : {};
      return [
        {
          resourceCode,
          instanceIndex,
          instanceTitle: row.title ? String(row.title) : null,
          sortOrder: Number(row.sort_order ?? 5 + instanceIndex),
          sourceSha256:
            typeof metadata["cf11_verified_bundle_sha256"] === "string"
              ? String(metadata["cf11_verified_bundle_sha256"])
              : null,
        },
      ];
    });

    return GOLDEN_CAPABILITIES.flatMap((capability) => {
      const lifecycleCapability = GOLDEN_LIFECYCLE_TARGETS[capability];
      const lifecycle = lifecycleByCapability.get(lifecycleCapability);
      if (lifecycle?.status !== "READY") return [];
      const publication = latestPublication.get(capability);
      if (capability === "labExperimentHtml" && managedExperiments.length > 0) {
        return managedExperiments.map((experiment) => ({
          lessonId: String(lessonId),
          capability,
          lifecycleCapability,
          publicationVersion: publication ? Number(publication.publication_version) : null,
          sourceSha256: experiment.sourceSha256,
          publishedAt: publication?.published_at ?? lifecycle.ready_at ?? null,
          visibleToStudent: true as const,
          resourceCode: experiment.resourceCode,
          instanceIndex: experiment.instanceIndex,
          instanceTitle: experiment.instanceTitle,
          sortOrder: experiment.sortOrder,
        }));
      }
      return [
        {
          lessonId: String(lessonId),
          capability,
          lifecycleCapability,
          publicationVersion: publication ? Number(publication.publication_version) : null,
          sourceSha256: publication?.source_sha256 ?? lifecycle.ready_hash ?? null,
          publishedAt: publication?.published_at ?? lifecycle.ready_at ?? null,
          visibleToStudent: true as const,
        },
      ];
    });
  });
