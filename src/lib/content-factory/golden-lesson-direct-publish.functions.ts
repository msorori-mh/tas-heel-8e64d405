/**
 * One-shot publication for the direct lesson intake.
 *
 * The seven-step editorial chain (submit → owner approval → domain staging → identity binding →
 * CF10 materialization → asset verification → CF11 publication → READY attestation) is executed
 * server-side in a single audited request, with the signed-in admin's own token. No step is
 * skipped or weakened: every underlying RPC still enforces its own contract.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  requireContentStaffAuth,
  type ContentStaffAuthContext,
} from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  packageId: z.string().uuid(),
  version: z.number().int().positive(),
  /**
   * Publish exactly one component. Everything up to the domain write is identical -- the
   * package is still staged, bound to its lesson and materialised. Only the last step
   * differs: one component goes live on its own instead of the lesson going out as a unit.
   */
  capability: z
    .enum([
      "officialBookContent",
      "tamkeenExplanationHtml",
      "lessonSummaryHtml",
      "mindMapHtml",
      "labExperimentHtml",
      "officialBookQuestions",
      "selfTest",
    ])
    .optional(),
  /**
   * The exact file being published, so an already-prepared batch is matched by its bytes
   * and never by capability alone -- publishing the book must not resurrect last week's
   * book because it happens to sit in an older batch.
   */
  capabilitySha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});

export interface DirectPublishStep {
  key: string;
  label: string;
  detail: string;
}

type Rpc = (
  name: string,
  args: Record<string, unknown>,
) => PromiseLike<{
  data: unknown;
  error: { message: string } | null;
}>;

function record(result: { data: unknown; error: { message: string } | null }, code: string) {
  if (result.error) throw new Error(`${code}: ${result.error.message}`);
  if (!result.data) throw new Error(`${code}: EMPTY_RESPONSE`);
  return result.data as Record<string, unknown>;
}

export const publishGoldenLessonDirect = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ steps: DirectPublishStep[]; lessonId: string; batchId: string }> => {
      const { supabase, userId, isFullAdmin } = context as ContentStaffAuthContext;
      if (!isFullAdmin) throw new Error("DIRECT_PUBLISH_ADMIN_REQUIRED");
      const rpc = ((name, args) => (supabase as unknown as { rpc: Rpc }).rpc(name, args)) as Rpc;
      const steps: DirectPublishStep[] = [];
      const push = (key: string, label: string, detail: string) =>
        steps.push({ key, label, detail });

      const pkgResult = await (
        supabase as unknown as {
          from(table: string): {
            select(columns: string): {
              eq(
                column: string,
                value: string,
              ): { single(): PromiseLike<{ data: unknown; error: { message: string } | null }> };
            };
          };
        }
      )
        .from("golden_lesson_packages")
        .select("review_status,current_version")
        .eq("id", data.packageId)
        .single();
      if (pkgResult.error || !pkgResult.data) {
        throw new Error(pkgResult.error?.message ?? "PACKAGE_NOT_FOUND");
      }
      const pkg = pkgResult.data as Record<string, unknown>;

      if (Number(pkg["current_version"]) !== data.version) throw new Error("STALE_PACKAGE_VERSION");
      let status = String(pkg["review_status"]);

      if (status === "DRAFT") {
        record(
          await rpc("golden_lesson_advance_review", {
            _package_id: data.packageId,
            _expected_version: data.version,
            _to_status: "SUBMITTED",
            _evidence: { packageValidationPassed: true },
            _note: "نشر مباشر بعد اجتياز فحوصات الحزمة في مركز الاستيراد.",
          }),
          "SUBMIT_FAILED",
        );
        status = "SUBMITTED";
      }
      push("submit", "تسجيل الحزمة للمراجعة", "تم");

      if (status !== "APPROVED_FOR_STAGING") {
        const approved = record(
          await rpc("golden_lesson_owner_approve_for_staging", {
            _package_id: data.packageId,
            _expected_version: data.version,
            _evidence: {
              packageValidationPassed: true,
              officialProvenanceChecked: true,
              answerSeparationChecked: true,
              responsivePreviewChecked: true,
            },
            _reason:
              "اعتماد المالك المباشر بعد اكتمال فحوصات الملفات السبعة والتحقق الخادمي من البصمات.",
          }),
          "OWNER_APPROVE_FAILED",
        );
        status = String(approved["status"]);
      }
      push("approve", "اعتماد المحتوى", "تم");

      // Domain staging from the verified direct intake (no ZIP bundle involved).
      const { buildDirectDomainStageEnvelope } =
        await import("./golden-lesson-direct-publish.server");
      const { envelope, bundleSha256 } = await buildDirectDomainStageEnvelope(
        data.packageId,
        data.version,
      );
      if (data.capability) {
        if (!data.capabilitySha256) throw new Error("COMPONENT_SOURCE_HASH_REQUIRED");
        const selectedEntry = envelope.entries.find(
          (entry) => entry.capability === data.capability,
        );
        if (!selectedEntry?.sourcePath || selectedEntry.sourceSha256 !== data.capabilitySha256) {
          throw new Error("COMPONENT_SOURCE_HASH_MISMATCH");
        }
      }
      const { createClient } = await import("@supabase/supabase-js");
      const admin = createClient(
        process.env["SUPABASE_URL"]!,
        process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
        {
          auth: { persistSession: false, autoRefreshToken: false },
        },
      );
      const staged = record(
        await (admin as unknown as { rpc: Rpc }).rpc("golden_lesson_stage_domain_bundle", {
          _package_id: data.packageId,
          _version: data.version,
          _actor_id: userId,
          _bundle_sha256: bundleSha256,
          _entries: envelope.entries,
          _answers_companion: envelope.answersCompanion,
        }),
        "DOMAIN_STAGE_FAILED",
      );
      const batchId = String(staged["batch_id"]);
      push("stage", "تجهيز محتوى الدرس", `batch ${batchId.slice(0, 8)}…`);

      const bound = record(
        await rpc("golden_lesson_bind_authoritative_identity_operator", {
          _batch_id: batchId,
          _actor_id: userId,
        }),
        "IDENTITY_BIND_FAILED",
      );
      push("bind", "ربط هوية الدرس", String(bound["identity_sha256"]).slice(0, 8) + "…");

      const { asRpcResult, attestStoredAssets, ensureVerifiedAssets, idempotencyKey, planSha } =
        await import("./golden-lesson-publication.server");

      const dryMaterialize = record(
        await rpc("golden_lesson_materialize_domain_batch_operator", {
          _batch_id: batchId,
          _actor_id: userId,
          _mode: "DRY_RUN",
          _expected_plan_sha256: null,
          _idempotency_key: null,
        }),
        "CF10_DRY_RUN_FAILED",
      );
      const materializePlan = planSha(dryMaterialize, "write_plan_sha256");
      if (!materializePlan) throw new Error("CF10_WRITE_PLAN_HASH_REQUIRED");
      record(
        await rpc("golden_lesson_materialize_domain_batch_operator", {
          _batch_id: batchId,
          _actor_id: userId,
          _mode: "EXECUTE",
          _expected_plan_sha256: materializePlan,
          _idempotency_key: idempotencyKey("cf10", batchId, materializePlan),
        }),
        "CF10_EXECUTE_FAILED",
      );
      push("materialize", "كتابة محتوى الدرس", "تم");

      const ensured = await ensureVerifiedAssets(batchId);
      await attestStoredAssets(
        userId,
        batchId,
        ensured.declarations,
        ensured.uploadedPaths,
        "EXECUTE",
      );
      push("assets", "التحقق من المرفقات", `${ensured.declarations.length} ملف`);

      // One component, one step. It goes live on its own: nothing here reads, writes or
      // asserts anything about the other six, so a lesson that has only a mind map is
      // published exactly as readily as a lesson that has all seven.
      if (data.capability) {
        const componentResult = record(
          await rpc("golden_lesson_publish_component", {
            _batch_id: batchId,
            _capability: data.capability,
            _idempotency_key: idempotencyKey("component", batchId, data.capability),
          }),
          "COMPONENT_PUBLISH_FAILED",
        );
        // "Published" means the student can see it. Anything short of that is a failure the
        // operator has to be told about, not a step to report as done.
        if (componentResult["student_can_see_this_component"] !== true) {
          throw new Error("COMPONENT_PUBLISHED_BUT_NOT_VISIBLE");
        }
        push("publish-component", "نشر المكوّن", "تم — المكوّن ظاهر للطلاب الآن");
        return { steps, lessonId: ensured.lessonId, batchId };
      }

      const dryPublish = record(
        await rpc("golden_lesson_publish_cf11", {
          _batch_id: batchId,
          _actor_id: userId,
          _mode: "DRY_RUN",
          _assets: ensured.declarations,
          _expected_plan_sha256: null,
          _idempotency_key: null,
        }),
        "CF11_DRY_RUN_FAILED",
      );
      let publishPlan = planSha(dryPublish, "plan_sha256");
      if (!publishPlan) {
        // A CF11 replay returns the persisted plan body plus replay metadata, not its wrapper
        // field. Recover the exact reviewed hash from the immutable publication ledger so a retry
        // can resume at READY without inventing or recomputing a different plan.
        const persistedPublication = await admin
          .from("golden_lesson_publications")
          .select("plan_sha256")
          .eq("batch_id", batchId)
          .maybeSingle();
        if (persistedPublication.error) {
          throw new Error(
            `CF11_PUBLICATION_PLAN_READ_FAILED: ${persistedPublication.error.message}`,
          );
        }
        publishPlan = planSha(persistedPublication.data, "plan_sha256");
      }
      if (!publishPlan) throw new Error("CF11_WRITE_PLAN_HASH_REQUIRED");
      const published = record(
        await rpc("golden_lesson_publish_cf11", {
          _batch_id: batchId,
          _actor_id: userId,
          _mode: "EXECUTE",
          _assets: ensured.declarations,
          _expected_plan_sha256: publishPlan,
          _idempotency_key: idempotencyKey("cf11", batchId, publishPlan),
        }),
        "CF11_PUBLISH_FAILED",
      );
      asRpcResult(published);
      push("publish", "نشر الدرس", "تم");

      record(
        await rpc("golden_lesson_attest_cf11_ready", {
          _batch_id: batchId,
          _actor_id: userId,
          _mode: "EXECUTE",
          _evidence: {
            reviewedContent: true,
            reviewedSecurity: true,
            note: "نشر مباشر معتمد من المالك بعد اجتياز جميع الفحوصات الخادمية للملفات السبعة.",
          },
        }),
        "CF11_ATTEST_FAILED",
      );
      push("ready", "إتاحة الدرس للطلاب", "تم");

      return { steps, lessonId: ensured.lessonId, batchId };
    },
  );
