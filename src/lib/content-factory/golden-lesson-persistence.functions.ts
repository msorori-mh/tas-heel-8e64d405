import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  requireContentStaffAuth,
  type ContentStaffAuthContext,
} from "@/integrations/supabase/auth-middleware";
import type { GoldenLessonPackage } from "./golden-lesson-contract";
import { parseGoldenLessonManifest, previewGoldenLessonStaging } from "./golden-lesson-staging";

export type GoldenPersistentReviewStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "CONTENT_APPROVED"
  | "APPROVED_FOR_STAGING";

export interface GoldenPackageSummary {
  id: string;
  packageCode: string;
  profileId: string;
  currentVersion: number;
  reviewStatus: GoldenPersistentReviewStatus;
  updatedAt: string;
}

export interface GoldenPackageVersion {
  version: number;
  clientManifestSha256: string;
  canonicalManifestSha256: string;
  createdAt: string;
}

export interface GoldenPackageReview {
  packageVersion: number;
  fromStatus: GoldenPersistentReviewStatus;
  toStatus: GoldenPersistentReviewStatus;
  actorRole: "CONTENT_EDITOR" | "CONTENT_REVIEWER" | "TECHNICAL_REVIEWER";
  evidence: Record<string, boolean | string | number | null>;
  note: string | null;
  createdAt: string;
}

type DbResult<T> = { data: T | null; error: { code?: string; message: string } | null };
type PendingSelect<T> = PromiseLike<DbResult<T>> & {
  eq(column: string, value: string | number): PendingSelect<T>;
  order(column: string, options?: { ascending?: boolean }): PendingSelect<T>;
  limit(count: number): PendingSelect<T>;
};
type PendingTable = { select(columns: string): PendingSelect<unknown[]> };
type PendingClient = {
  from(table: string): PendingTable;
  rpc(name: string, args: Record<string, unknown>): PromiseLike<DbResult<unknown>>;
};

const PackageId = z.string().uuid();
const Hash = z.string().regex(/^[a-f0-9]{64}$/);
const AdvanceInput = z.object({
  packageId: PackageId,
  expectedVersion: z.number().int().positive(),
  toStatus: z.enum(["SUBMITTED", "CONTENT_APPROVED", "APPROVED_FOR_STAGING"]),
  evidence: z.record(z.string(), z.unknown()),
  note: z.string().trim().max(1000).nullable().default(null),
});
const OwnerApproveInput = z.object({
  packageId: PackageId,
  expectedVersion: z.number().int().positive(),
  evidence: z.record(z.string(), z.unknown()),
  reason: z.string().trim().min(20).max(1000),
});
const StageInput = z.object({ manifest: z.unknown(), clientManifestSha256: Hash });

const MISSING_SCHEMA_CODES = new Set(["42P01", "42883", "PGRST202", "PGRST205"]);
function pendingClient(context: ContentStaffAuthContext): PendingClient {
  // Pending CF04 objects are intentionally absent from generated Database types until apply.
  return context.supabase as unknown as PendingClient;
}
function isMissingSchema(error: { code?: string; message: string }): boolean {
  return MISSING_SCHEMA_CODES.has(error.code ?? "") || /golden_lesson_(packages|stage_manifest)/i.test(error.message) && /not find|does not exist|schema cache/i.test(error.message);
}
function assertDb<T>(result: DbResult<T>): T {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error("EMPTY_DATABASE_RESPONSE");
  return result.data;
}

export const getGoldenLessonPersistenceCapability = createServerFn({ method: "GET" })
  .middleware([requireContentStaffAuth])
  .handler(async ({ context }): Promise<{ available: boolean; reason: "AVAILABLE" | "SCHEMA_NOT_APPLIED" }> => {
    const db = pendingClient(context as ContentStaffAuthContext);
    const result = await db.from("golden_lesson_packages").select("id").limit(1);
    if (result.error && isMissingSchema(result.error)) return { available: false, reason: "SCHEMA_NOT_APPLIED" };
    if (result.error) throw new Error(result.error.message);
    return { available: true, reason: "AVAILABLE" };
  });

export const listGoldenLessonPackages = createServerFn({ method: "GET" })
  .middleware([requireContentStaffAuth])
  .handler(async ({ context }): Promise<GoldenPackageSummary[]> => {
    const db = pendingClient(context as ContentStaffAuthContext);
    const rows = assertDb(await db.from("golden_lesson_packages")
      .select("id,package_code,profile_id,current_version,review_status,updated_at")
      .order("updated_at", { ascending: false }).limit(100)) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id), packageCode: String(row.package_code), profileId: String(row.profile_id),
      currentVersion: Number(row.current_version), reviewStatus: row.review_status as GoldenPersistentReviewStatus,
      updatedAt: String(row.updated_at),
    }));
  });

export const getGoldenLessonPackageHistory = createServerFn({ method: "GET" })
  .middleware([requireContentStaffAuth])
  .inputValidator((input) => PackageId.parse(input))
  .handler(async ({ data, context }): Promise<{ versions: GoldenPackageVersion[]; reviews: GoldenPackageReview[] }> => {
    const db = pendingClient(context as ContentStaffAuthContext);
    const [versionsResult, reviewsResult] = await Promise.all([
      db.from("golden_lesson_package_versions").select("version,client_manifest_sha256,canonical_manifest_sha256,created_at")
        .eq("package_id", data).order("version", { ascending: false }),
      db.from("golden_lesson_package_reviews").select("package_version,from_status,to_status,actor_role,evidence,note,created_at")
        .eq("package_id", data).order("created_at", { ascending: false }),
    ]);
    const versions = assertDb(versionsResult) as Array<Record<string, unknown>>;
    const reviews = assertDb(reviewsResult) as Array<Record<string, unknown>>;
    return {
      versions: versions.map((row) => ({ version: Number(row.version), clientManifestSha256: String(row.client_manifest_sha256), canonicalManifestSha256: String(row.canonical_manifest_sha256), createdAt: String(row.created_at) })),
      reviews: reviews.map((row) => ({ packageVersion: Number(row.package_version), fromStatus: row.from_status as GoldenPersistentReviewStatus, toStatus: row.to_status as GoldenPersistentReviewStatus, actorRole: row.actor_role as GoldenPackageReview["actorRole"], evidence: (row.evidence ?? {}) as Record<string, boolean | string | number | null>, note: row.note === null ? null : String(row.note), createdAt: String(row.created_at) })),
    };
  });

export const stageGoldenLessonManifest = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator((input) => StageInput.parse(input))
  .handler(async ({ data, context }): Promise<{ packageId: string; version: number; status: GoldenPersistentReviewStatus; idempotent: boolean; writesPerformed: number }> => {
    const manifest = parseGoldenLessonManifest(JSON.stringify(data.manifest));
    if (!previewGoldenLessonStaging(manifest).valid) throw new Error("MANIFEST_SERVER_VALIDATION_FAILED");
    const result = assertDb(await pendingClient(context as ContentStaffAuthContext).rpc("golden_lesson_stage_manifest", {
      _manifest: manifest as GoldenLessonPackage, _client_manifest_sha256: data.clientManifestSha256,
    })) as Record<string, unknown>;
    return { packageId: String(result.package_id), version: Number(result.version), status: result.status as GoldenPersistentReviewStatus, idempotent: Boolean(result.idempotent), writesPerformed: Number(result.writes_performed) };
  });

export const advanceGoldenLessonReview = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator((input) => AdvanceInput.parse(input))
  .handler(async ({ data, context }): Promise<{ packageId: string; version: number; status: GoldenPersistentReviewStatus; writesPerformed: number; domainWritesPerformed: 0 }> => {
    const result = assertDb(await pendingClient(context as ContentStaffAuthContext).rpc("golden_lesson_advance_review", {
      _package_id: data.packageId, _expected_version: data.expectedVersion, _to_status: data.toStatus,
      _evidence: data.evidence, _note: data.note,
    })) as Record<string, unknown>;
    return { packageId: String(result.package_id), version: Number(result.version), status: result.status as GoldenPersistentReviewStatus, writesPerformed: Number(result.writes_performed), domainWritesPerformed: 0 };
  });


export const ownerApproveGoldenLessonForStaging = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator((input) => OwnerApproveInput.parse(input))
  .handler(async ({ data, context }): Promise<{ packageId: string; version: number; status: GoldenPersistentReviewStatus; idempotent: boolean; writesPerformed: number; domainWritesPerformed: 0 }> => {
    const result = assertDb(await pendingClient(context as ContentStaffAuthContext).rpc("golden_lesson_owner_approve_for_staging", {
      _package_id: data.packageId,
      _expected_version: data.expectedVersion,
      _evidence: data.evidence,
      _reason: data.reason,
    })) as Record<string, unknown>;
    return {
      packageId: String(result.package_id),
      version: Number(result.version),
      status: result.status as GoldenPersistentReviewStatus,
      idempotent: Boolean(result.idempotent),
      writesPerformed: Number(result.writes_performed),
      domainWritesPerformed: 0,
    };
  });
