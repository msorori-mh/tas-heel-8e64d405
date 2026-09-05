import { validateGoldenLessonAssets, type GoldenLessonAsset } from "./golden-lesson-assets.ts";
import {
  GOLDEN_CAPABILITIES,
  GOLDEN_CAPABILITY_AUTHORITY,
  GOLDEN_LESSON_SCHEMA,
  type GoldenCapability,
  type GoldenLessonPackage,
} from "./golden-lesson-contract.ts";
import { getGoldenLessonProfile } from "./golden-lesson-profiles.ts";
import { validateGoldenLessonArtifactPath } from "./golden-lesson-file-contract.ts";

export type GoldenLessonFindingSeverity = "ERROR" | "WARNING";

export interface GoldenLessonFinding {
  code: string;
  severity: GoldenLessonFindingSeverity;
  field: string;
  messageAr: string;
}

export interface GoldenLessonValidationResult {
  valid: boolean;
  writesPerformed: 0;
  findings: GoldenLessonFinding[];
}

const CODE = /^[A-Z0-9][A-Z0-9-]{2,63}$/;
const TRACK_CODE = /^[a-z0-9][a-z0-9-]{1,31}$/;
const SHA256 = /^[a-f0-9]{64}$/;

function hasUnsafePathCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return (
      character === "/" || character === "\\" || (codePoint !== undefined && codePoint <= 0x1f)
    );
  });
}

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function validateGoldenLessonPackage(
  pkg: GoldenLessonPackage,
): GoldenLessonValidationResult {
  const findings: GoldenLessonFinding[] = [];
  const error = (code: string, field: string, messageAr: string) =>
    findings.push({ code, severity: "ERROR", field, messageAr });
  const warning = (code: string, field: string, messageAr: string) =>
    findings.push({ code, severity: "WARNING", field, messageAr });

  if (pkg.schema !== GOLDEN_LESSON_SCHEMA)
    error("SCHEMA_UNSUPPORTED", "schema", "إصدار مخطط الحزمة غير مدعوم.");
  const profile = getGoldenLessonProfile(pkg.profileId);
  if (!profile) error("PROFILE_UNKNOWN", "profileId", "نمط الدرس الذهبي غير معروف.");
  if (!CODE.test(pkg.packageCode)) {
    error(
      "PACKAGE_CODE_INVALID",
      "packageCode",
      "رمز الحزمة مطلوب ويجب أن يكون ثابتًا وبأحرف لاتينية كبيرة.",
    );
  }

  for (const [field, value] of [
    ["identity.gradeCode", pkg.identity.gradeCode],
    ["identity.subjectCode", pkg.identity.subjectCode],
    ["identity.lessonCode", pkg.identity.lessonCode],
  ] as const) {
    if (!CODE.test(value))
      error("IDENTITY_CODE_INVALID", field, "رمز الهوية يجب أن يكون ثابتًا وبأحرف لاتينية كبيرة.");
  }
  if (
    pkg.identity.curriculumTrackCodes.length === 0 ||
    pkg.identity.curriculumTrackCodes.some((code) => !TRACK_CODE.test(code))
  ) {
    error(
      "TRACK_IDENTITY_INVALID",
      "identity.curriculumTrackCodes",
      "يجب تحديد مسار منهجي صحيح واحد على الأقل.",
    );
  }
  if (!pkg.identity.lessonSlug.trim())
    error("LESSON_SLUG_MISSING", "identity.lessonSlug", "اسم رابط الدرس مطلوب.");
  const lessonFamily = pkg.identity.lessonCode.toUpperCase().startsWith("QURAN-")
    ? "QURAN"
    : pkg.identity.lessonCode.toUpperCase().startsWith("CHEM-")
      ? "SCIENCE"
      : null;
  if (profile && lessonFamily && profile.subjectFamily !== lessonFamily) {
    error(
      "PROFILE_IDENTITY_MISMATCH",
      "profileId",
      "نمط الدرس المختار لا يطابق رمز الدرس؛ اختر نمط المادة الصحيح.",
    );
  }
  if (pkg.identity.semester === null)
    warning("SEMESTER_PENDING", "identity.semester", "الفصل الدراسي غير محسوم وسيبقى PENDING.");
  if (pkg.identity.sortOrder === null)
    warning("SORT_ORDER_PENDING", "identity.sortOrder", "ترتيب الدرس غير محسوم وسيبقى PENDING.");

  if (!sameOrder(pkg.capabilityOrder, GOLDEN_CAPABILITIES)) {
    error("CAPABILITY_ORDER_INVALID", "capabilityOrder", "ترتيب القدرات لا يطابق عقد Content V3.");
  }
  if (profile && !sameOrder(pkg.capabilityOrder, profile.capabilityOrder)) {
    error("PROFILE_ORDER_MISMATCH", "capabilityOrder", "ترتيب الحزمة لا يطابق النمط المختار.");
  }

  const seen = new Set<GoldenCapability>();
  const labArtifacts = pkg.artifacts.filter(
    (artifact) => artifact.capability === "labExperimentHtml",
  );
  for (const [artifactPosition, artifact] of pkg.artifacts.entries()) {
    if (seen.has(artifact.capability) && artifact.capability !== "labExperimentHtml")
      error(
        "CAPABILITY_DUPLICATE",
        `artifacts.${artifact.capability}`,
        "هذه القدرة لا تقبل أكثر من ملف واحد داخل الحزمة.",
      );
    seen.add(artifact.capability);
    const artifactField = `artifacts.${artifact.capability}.${artifactPosition}`;
    if (
      artifact.capability !== "labExperimentHtml" &&
      (artifact.instanceIndex !== undefined || artifact.instanceTitle !== undefined)
    ) {
      error(
        "ARTIFACT_INSTANCE_FORBIDDEN",
        artifactField,
        "خصائص تعدد النسخ مسموحة للتجربة المعملية فقط.",
      );
    }
    if (
      artifact.instanceTitle !== undefined &&
      artifact.instanceTitle !== null &&
      (typeof artifact.instanceTitle !== "string" ||
        artifact.instanceTitle.trim().length === 0 ||
        artifact.instanceTitle.trim().length > 120)
    ) {
      error(
        "ARTIFACT_INSTANCE_TITLE_INVALID",
        `${artifactField}.instanceTitle`,
        "عنوان التجربة يجب أن يكون نصًا من 1 إلى 120 محرفًا.",
      );
    }
    if (artifact.authority !== GOLDEN_CAPABILITY_AUTHORITY[artifact.capability]) {
      error(
        "AUTHORITY_MISMATCH",
        `artifacts.${artifact.capability}.authority`,
        "ملكية المحتوى لا تطابق العقد الرسمي/تمكين.",
      );
    }
    if (profile && artifact.applicability !== profile.applicability[artifact.capability]) {
      error(
        "APPLICABILITY_MISMATCH",
        `artifacts.${artifact.capability}.applicability`,
        "حالة انطباق القدرة لا تطابق النمط.",
      );
    }
    if (artifact.applicability === "NA") {
      if (artifact.sourcePath !== null || artifact.sha256 !== null) {
        error(
          "NA_ARTIFACT_HAS_CONTENT",
          `artifacts.${artifact.capability}`,
          "القدرة غير المنطبقة لا يجوز أن تحمل محتوى.",
        );
      }
      continue;
    }
    // Every capability publishes on its own schedule: an artifact with no file is a
    // capability the team has not uploaded yet, never a reason to reject the package.
    if (artifact.sourcePath && (!artifact.sha256 || !SHA256.test(artifact.sha256))) {
      error(
        "ARTIFACT_HASH_INVALID",
        `artifacts.${artifact.capability}.sha256`,
        "SHA-256 مفقود أو غير صالح.",
      );
    }
    if (artifact.sourcePath) {
      for (const finding of validateGoldenLessonArtifactPath(
        artifact.capability,
        artifact.sourcePath,
      ).findings) {
        error(finding.code, `artifacts.${artifact.capability}.sourcePath`, finding.messageAr);
      }
    }
    // Generated internally from the registered subject textbook; never uploaded by the operator.
    if (artifact.authority === "OFFICIAL" && artifact.sourcePath) {
      if (!artifact.provenancePath) {
        error(
          "OFFICIAL_PROVENANCE_MISSING",
          `artifacts.${artifact.capability}.provenancePath`,
          "مرجع كتاب المادة النظامي مفقود.",
        );
      }
      if (!artifact.provenanceSha256 || !SHA256.test(artifact.provenanceSha256)) {
        error(
          "OFFICIAL_PROVENANCE_HASH_INVALID",
          `artifacts.${artifact.capability}.provenanceSha256`,
          "بصمة مرجع كتاب المادة النظامي غير صالحة.",
        );
      }
    }
  }
  if (labArtifacts.length > 1) {
    const indices = labArtifacts.map((artifact) => artifact.instanceIndex);
    if (
      labArtifacts.length > 99 ||
      indices.some((index) => !Number.isInteger(index) || Number(index) < 0) ||
      new Set(indices).size !== indices.length ||
      !indices
        .map(Number)
        .sort((left, right) => left - right)
        .every((index, position) => index === position)
    ) {
      error(
        "LAB_INSTANCE_INDEX_INVALID",
        "artifacts.labExperimentHtml",
        "عند رفع أكثر من تجربة يجب ترقيمها بفهارس فريدة ومتصلة تبدأ من 0.",
      );
    }
    if (labArtifacts.some((artifact) => artifact.applicability === "NA" || !artifact.sourcePath)) {
      error(
        "LAB_INSTANCE_CONTENT_MISSING",
        "artifacts.labExperimentHtml",
        "كل سجل في حزمة متعددة التجارب يجب أن يحمل ملفًا مستقلًا.",
      );
    }
  } else if (labArtifacts[0]?.instanceIndex !== undefined && labArtifacts[0].instanceIndex !== 0) {
    error(
      "LAB_INSTANCE_INDEX_INVALID",
      "artifacts.labExperimentHtml.0.instanceIndex",
      "فهرس التجربة الوحيدة، إن وُجد، يجب أن يساوي 0.",
    );
  }
  for (const capability of GOLDEN_CAPABILITIES) {
    if (!seen.has(capability))
      error(
        "CAPABILITY_RECORD_MISSING",
        `artifacts.${capability}`,
        "سجل القدرة مفقود، حتى إن كانت NA.",
      );
  }

  // No capability is mandatory on its own, but a package that carries nothing has
  // nothing to publish — the one floor that replaces the old "all REQUIRED" rule.
  if (!pkg.artifacts.some((artifact) => artifact.sourcePath)) {
    error("PACKAGE_HAS_NO_CONTENT", "artifacts", "ارفع مكوّناً واحداً على الأقل قبل الفحص.");
  }

  if (pkg.lifecycle.initialStatus !== "DRAFT" || pkg.lifecycle.allowDirectReady !== false) {
    error(
      "LIFECYCLE_UNSAFE",
      "lifecycle",
      "يجب أن تبدأ الحزمة DRAFT ولا تسمح بالانتقال المباشر إلى READY.",
    );
  }
  if (pkg.security.productionApply !== false)
    error(
      "PRODUCTION_APPLY_FORBIDDEN",
      "security.productionApply",
      "حزمة الفريق لا تمنح صلاحية كتابة إنتاجية.",
    );
  if (pkg.security.publicPayloadContainsAnswers !== false)
    error(
      "ANSWER_LEAK",
      "security.publicPayloadContainsAnswers",
      "الإجابات ممنوعة من الحمولة العامة.",
    );
  if (pkg.security.htmlNetworkAccess !== "NONE")
    error(
      "HTML_NETWORK_FORBIDDEN",
      "security.htmlNetworkAccess",
      "HTML التفاعلي لا يسمح باتصالات شبكة.",
    );
  if (
    pkg.security.answersCompanionPath &&
    !pkg.security.answersCompanionPath.endsWith(".server-only.json")
  ) {
    error(
      "ANSWER_COMPANION_PATH_UNSAFE",
      "security.answersCompanionPath",
      "ملف الإجابات يجب أن يكون server-only.",
    );
  }
  if (
    pkg.security.answersCompanionPath &&
    (!pkg.security.answersCompanionSha256 || !SHA256.test(pkg.security.answersCompanionSha256))
  ) {
    error(
      "ANSWER_COMPANION_HASH_INVALID",
      "security.answersCompanionSha256",
      "ملف الإجابات يحتاج SHA-256 صالحًا.",
    );
  }
  if (!pkg.security.answersCompanionPath && pkg.security.answersCompanionSha256) {
    error(
      "ANSWER_COMPANION_PATH_MISSING",
      "security.answersCompanionPath",
      "لا يجوز تثبيت بصمة إجابات دون مسار ملف خادمي.",
    );
  }

  // CF11: supplemental static assets are part of the package path namespace and of the
  // ZIP file-set equality check. `undefined` is a valid v1 manifest (no assets at all).
  const assets: GoldenLessonAsset[] = Array.isArray(pkg.assets) ? pkg.assets : [];
  if (pkg.assets !== undefined && !Array.isArray(pkg.assets)) {
    error("ASSETS_SHAPE_INVALID", "assets", "قائمة الأصول الثابتة يجب أن تكون مصفوفة.");
  }
  const capabilityHasSource = (capability: GoldenCapability): boolean =>
    pkg.artifacts.some(
      (artifact) =>
        artifact.capability === capability &&
        artifact.applicability !== "NA" &&
        Boolean(artifact.sourcePath),
    );
  for (const finding of validateGoldenLessonAssets(assets, capabilityHasSource)) {
    error(finding.code, finding.field, finding.messageAr);
  }

  const packagePaths = [
    ...pkg.artifacts.flatMap((artifact) => [artifact.sourcePath, artifact.provenancePath]),
    ...assets.map((asset) => (typeof asset?.path === "string" ? asset.path : null)),
    pkg.security.answersCompanionPath,
  ].filter((path): path is string => typeof path === "string");
  const seenPaths = new Set<string>();
  for (const path of packagePaths) {
    if (
      !path ||
      path.length > 255 ||
      path === "." ||
      path === ".." ||
      hasUnsafePathCharacter(path)
    ) {
      error(
        "PACKAGE_PATH_UNSAFE",
        "artifacts",
        "اسم الملف غير آمن؛ استخدم اسم ملف فقط دون مجلدات أو محارف تحكم.",
      );
    }
    if (seenPaths.has(path))
      error(
        "PACKAGE_PATH_DUPLICATE",
        "artifacts",
        "لا يجوز أن يشترك ملفان في الاسم نفسه داخل الحزمة.",
      );
    seenPaths.add(path);
  }

  return {
    valid: findings.every((finding) => finding.severity !== "ERROR"),
    writesPerformed: 0,
    findings,
  };
}
