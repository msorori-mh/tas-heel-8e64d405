export const IRON_IMPORT_REQUIRED_GATES = [
  "R5_APPLIED",
  "21H_APPLIED",
  "POSTVERIFY_PASS",
  "VISIBILITY_DIFF_ZERO",
] as const;

export type IronImportGate = (typeof IRON_IMPORT_REQUIRED_GATES)[number];

export interface IronBindingPlan {
  mode: string;
  preconditions: {
    required_schema_gates: readonly string[];
    fail_closed: boolean;
  };
  identity: {
    grade: { id: string };
    tracks: ReadonlyArray<{ id: string; code: string }>;
    subject: { code: string; slug: string; name_ar: string };
    lesson: {
      code: string;
      slug: string;
      title_ar: string;
      unit_id: null;
      semester: number | null;
      sort_order: number | null;
      is_free: boolean;
    };
  };
  write_contract: {
    initial_lifecycle_status: string;
    expected_capabilities: readonly string[];
    no_delete: boolean;
    no_ready_transition: boolean;
  };
  textbooks: {
    records: ReadonlyArray<{
      natural_key: readonly string[];
      sha256: string;
      storage_object: string | null;
      reuse_same_object_as?: string;
    }>;
  };
  acceptance: { production_content_import_authorized: boolean };
}

export interface IronImportObservation {
  gates: Partial<Record<IronImportGate, boolean>>;
  gradeId: string | null;
  trackIdsByCode: Readonly<Record<string, string | undefined>>;
  subject?: { id: string; code: string; gradeId: string };
  lesson?: { id: string; code: string; subjectId: string; unitId: string | null };
  textbookHashesByNaturalKey?: Readonly<Record<string, string | undefined>>;
}

export interface IronImportIntent {
  order: number;
  kind: "CREATE_IF_ABSENT" | "BIND_IF_ABSENT" | "UPLOAD_IF_ABSENT" | "UPSERT_DRAFT";
  entity: string;
  naturalKey: string;
  writesProduction: true;
}

export interface IronImportDryRun {
  verdict: "READY_FOR_OWNER_APPLY" | "BLOCKED";
  writesPerformed: 0;
  blockers: string[];
  intents: IronImportIntent[];
  expectedWriteIntentCount: number;
}

function key(parts: readonly string[]): string {
  return parts.join("\u001f");
}

/**
 * Pure, zero-write planner. It does not accept a database client and cannot
 * execute any intent. The owner-only apply adapter is a later gated stage.
 */
export function buildIronProductionImportDryRun(
  plan: IronBindingPlan,
  observation: IronImportObservation,
): IronImportDryRun {
  const blockers: string[] = [];

  if (!plan.preconditions.fail_closed) blockers.push("PLAN_NOT_FAIL_CLOSED");
  if (plan.mode !== "SOURCE_ONLY_NO_PRODUCTION_WRITES") blockers.push("UNEXPECTED_PLAN_MODE");
  if (plan.acceptance.production_content_import_authorized)
    blockers.push("SOURCE_PLAN_AUTHORIZES_PRODUCTION");
  if (!plan.write_contract.no_delete) blockers.push("DELETE_NOT_FORBIDDEN");
  if (!plan.write_contract.no_ready_transition) blockers.push("READY_TRANSITION_NOT_FORBIDDEN");
  if (plan.write_contract.initial_lifecycle_status !== "DRAFT")
    blockers.push("LIFECYCLE_NOT_DRAFT");

  for (const gate of IRON_IMPORT_REQUIRED_GATES) {
    if (!plan.preconditions.required_schema_gates.includes(gate))
      blockers.push(`PLAN_GATE_MISSING:${gate}`);
    if (observation.gates[gate] !== true) blockers.push(`SCHEMA_GATE_CLOSED:${gate}`);
  }

  if (observation.gradeId !== plan.identity.grade.id) blockers.push("GRADE_IDENTITY_MISMATCH");
  for (const track of plan.identity.tracks) {
    if (observation.trackIdsByCode[track.code] !== track.id)
      blockers.push(`TRACK_IDENTITY_MISMATCH:${track.code}`);
  }

  if (
    observation.subject &&
    (observation.subject.code !== plan.identity.subject.code ||
      observation.subject.gradeId !== plan.identity.grade.id)
  ) {
    blockers.push("SUBJECT_NATURAL_KEY_CONFLICT");
  }
  if (observation.lesson && observation.lesson.unitId !== null)
    blockers.push("LESSON_UNIT_INVENTED");
  if (
    observation.lesson &&
    observation.subject &&
    observation.lesson.subjectId !== observation.subject.id
  ) {
    blockers.push("LESSON_SUBJECT_CONFLICT");
  }

  const textbookHashes = observation.textbookHashesByNaturalKey ?? {};
  for (const record of plan.textbooks.records) {
    const naturalKey = key(record.natural_key);
    const existingHash = textbookHashes[naturalKey];
    if (existingHash && existingHash !== record.sha256)
      blockers.push(`TEXTBOOK_HASH_CONFLICT:${naturalKey}`);
  }

  const intents: IronImportIntent[] = [];
  let order = 1;
  const push = (kind: IronImportIntent["kind"], entity: string, naturalKey: string) => {
    intents.push({ order: order++, kind, entity, naturalKey, writesProduction: true });
  };

  push("CREATE_IF_ABSENT", "subjects", key([plan.identity.grade.id, plan.identity.subject.code]));
  for (const track of plan.identity.tracks) {
    push(
      "BIND_IF_ABSENT",
      "subject_curriculum_tracks",
      key([plan.identity.subject.code, track.id]),
    );
  }
  push("CREATE_IF_ABSENT", "lessons", key([plan.identity.subject.code, plan.identity.lesson.code]));

  const uploadedHashes = new Set<string>();
  for (const record of plan.textbooks.records) {
    if (!uploadedHashes.has(record.sha256)) {
      push("UPLOAD_IF_ABSENT", "private_textbook_object", record.sha256);
      uploadedHashes.add(record.sha256);
    }
    push("BIND_IF_ABSENT", "subject_textbooks", key(record.natural_key));
  }

  for (const capability of plan.write_contract.expected_capabilities) {
    push("UPSERT_DRAFT", "lesson_capability", key([plan.identity.lesson.code, capability]));
  }

  return {
    verdict: blockers.length === 0 ? "READY_FOR_OWNER_APPLY" : "BLOCKED",
    writesPerformed: 0,
    blockers,
    intents,
    expectedWriteIntentCount: intents.length,
  };
}
