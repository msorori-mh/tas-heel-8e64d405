import { describe, expect, it } from "vitest";

import {
  encodeOfflineAssessmentBundle,
  offlineAssessmentResourceId,
  parseOfflineAssessmentBundle,
  parseOfflineAssessmentResourceId,
  type OfflineAssessmentBundle,
} from "../../src/lib/offline/offline-assessment-contract";
import { readOfflineLessonAssessment } from "../../src/lib/offline/offline-assessment-engine";
import {
  readOfflineOfficialQuestionNotes,
  recordOfflineSelfTestAttempt,
  saveOfflineOfficialQuestionNote,
} from "../../src/lib/offline/offline-learning-journal";
import { buildOfflineSubjectPack } from "../../src/lib/offline/offline-pack-manifest";
import { sha256Hex, type OfflinePackManifest } from "../../src/lib/offline/offline-pack-contract";
import {
  recordVerifiedOfflineArtifact,
  registerOfflinePack,
} from "../../src/lib/offline/offline-pack-state";
import {
  MemoryOfflineStateAdapter,
  OfflineStateRepository,
  type OfflineStateSnapshot,
} from "../../src/lib/offline/offline-state-store";
import { syncOfflineOutbox } from "../../src/lib/offline/offline-sync";

const T0 = "2026-09-02T00:00:00.000Z";
const LESSON_ID = "lesson-1";

class CountingOfflineStateAdapter extends MemoryOfflineStateAdapter {
  writes = 0;

  override async write(value: OfflineStateSnapshot): Promise<void> {
    this.writes += 1;
    await super.write(value);
  }
}

function officialBundle(): OfflineAssessmentBundle {
  return {
    schemaVersion: 1,
    kind: "official-questions",
    lessonId: LESSON_ID,
    questions: [
      {
        questionId: "official-1",
        revisionId: "official-rev-1",
        questionText: "علّل أهمية الماء.",
        questionType: "SHORT_ANSWER",
        sortOrder: 1,
        options: [],
        modelAnswer: "لأنه أساس حياة الكائنات الحية.",
        explanation: "إجابة نموذجية مختصرة.",
        correctOptionIds: [],
      },
    ],
  };
}

function selfTestBundle(): OfflineAssessmentBundle {
  return {
    schemaVersion: 1,
    kind: "self-test",
    lessonId: LESSON_ID,
    questions: [
      {
        questionId: "self-1",
        revisionId: "self-rev-1",
        questionText: "اختر الإجابة الصحيحة.",
        questionType: "mcq",
        sortOrder: 1,
        options: [
          { id: "a", text: "الخيار الأول", sortOrder: 1 },
          { id: "b", text: "الخيار الثاني", sortOrder: 2 },
        ],
        correctOptionId: "b",
        explanation: "الخيار الثاني هو الصحيح.",
        feedbackByOption: {
          a: { whyCorrect: null, whyWrong: "راجع الفكرة الأساسية." },
          b: { whyCorrect: "أحسنت.", whyWrong: null },
        },
      },
    ],
  };
}

async function fixture(): Promise<{
  manifest: OfflinePackManifest;
  bodies: Map<string, Uint8Array>;
}> {
  const bundles = [officialBundle(), selfTestBundle()];
  const bodies = new Map<string, Uint8Array>();
  const artifacts = await Promise.all(
    bundles.map(async (bundle, index) => {
      const bytes = encodeOfflineAssessmentBundle(bundle);
      const resourceId = offlineAssessmentResourceId(bundle.kind, bundle.lessonId);
      bodies.set(resourceId, bytes);
      return {
        artifactId: resourceId,
        kind:
          bundle.kind === "official-questions" ? ("assessment" as const) : ("self-test" as const),
        resourceId,
        lessonId: bundle.lessonId,
        lessonTitle: "درس الماء",
        title: bundle.kind === "official-questions" ? "أسئلة الكتاب" : "اختبر فهمك",
        relativePath: `packs/subject-1/assessments/${index}.json`,
        contentType: "application/json; charset=utf-8",
        byteSize: bytes.byteLength,
        sha256: await sha256Hex(bytes),
        sortOrder: index,
      };
    }),
  );
  return {
    bodies,
    manifest: {
      schemaVersion: 1,
      packId: "subject-subject-1",
      revision: Date.parse(T0),
      generatedAt: T0,
      scope: {
        gradeId: "grade-12",
        curriculumTrackId: null,
        semester: 1,
        subjectId: "subject-1",
        subjectTitle: "الأحياء",
      },
      artifacts,
    },
  };
}

async function readyRepository() {
  const data = await fixture();
  const repository = new OfflineStateRepository(new MemoryOfflineStateAdapter());
  const registered = await registerOfflinePack(repository, "student-a", data.manifest, T0);
  for (const artifact of data.manifest.artifacts) {
    await recordVerifiedOfflineArtifact(
      repository,
      {
        ownerId: "student-a",
        packId: data.manifest.packId,
        manifestSha256: registered.manifestSha256,
        artifactId: artifact.artifactId,
        observedSha256: artifact.sha256,
        observedBytes: artifact.byteSize,
      },
      T0,
    );
  }
  return { ...data, repository };
}

describe("OFFLINE-05 private assessment contract", () => {
  it("encodes deterministically and binds resource ids to one lesson", () => {
    const left = encodeOfflineAssessmentBundle(officialBundle());
    const right = encodeOfflineAssessmentBundle(officialBundle());
    expect(left).toEqual(right);
    expect(parseOfflineAssessmentBundle(left)).toEqual(officialBundle());
    expect(parseOfflineAssessmentResourceId(`self-test:${LESSON_ID}`)).toEqual({
      kind: "self-test",
      lessonId: LESSON_ID,
    });
    expect(() => parseOfflineAssessmentResourceId(`unknown:${LESSON_ID}`)).toThrow(
      "OFFLINE_ASSESSMENT_RESOURCE_ID_INVALID",
    );
  });

  it("adds assessment bytes to the manifest without embedding their answer body", async () => {
    const official = encodeOfflineAssessmentBundle(officialBundle());
    const built = await buildOfflineSubjectPack({
      scope: {
        gradeId: "grade-12",
        curriculumTrackId: null,
        semester: 1,
        subjectId: "subject-1",
      },
      subjectTitle: "الأحياء",
      lessons: [
        {
          id: LESSON_ID,
          title: "درس الماء",
          sortOrder: 1,
          updatedAt: T0,
          managed: true,
          visible: true,
          readyCapabilities: {
            checkUnderstanding: { sha256: "a".repeat(64), readyAt: T0 },
          },
        },
      ],
      textSources: [],
      textbooks: [],
      assessmentSources: [
        {
          sourceType: "official-questions",
          lessonId: LESSON_ID,
          title: "أسئلة الكتاب",
          body: official,
          updatedAt: T0,
          sortOrder: 0,
        },
      ],
    });
    expect(built.manifest.artifacts).toHaveLength(1);
    expect(built.manifest.artifacts[0]).toMatchObject({
      kind: "assessment",
      resourceId: `official-questions:${LESSON_ID}`,
      contentType: "application/json; charset=utf-8",
    });
    expect(JSON.stringify(built.manifest)).not.toContain("أساس حياة الكائنات");
  });
});

describe("OFFLINE-05 local assessment engine", () => {
  it("exposes answer-free questions and reveals only after a student attempt", async () => {
    const { repository, bodies } = await readyRepository();
    const assessment = await readOfflineLessonAssessment(
      "student-a",
      LESSON_ID,
      repository,
      async (_ownerId, artifact) => bodies.get(artifact.artifactId) ?? null,
    );
    expect(assessment.officialQuestions).toEqual([
      {
        id: "official-1",
        revisionId: "official-rev-1",
        questionText: "علّل أهمية الماء.",
        questionType: "SHORT_ANSWER",
        sortOrder: 1,
        options: [],
        savedAnswer: null,
        selectedOptionId: null,
        isCorrect: null,
      },
    ]);
    expect(JSON.stringify(assessment.officialQuestions)).not.toContain("أساس حياة الكائنات");
    expect(() => assessment.revealOfficialAnswer("official-1", "official-rev-1", "  ")).toThrow(
      "OFFLINE_ASSESSMENT_ATTEMPT_REQUIRED",
    );
    expect(
      assessment.revealOfficialAnswer("official-1", "official-rev-1", "محاولتي"),
    ).toMatchObject({ modelAnswer: "لأنه أساس حياة الكائنات الحية." });
  });

  it("grades a saved self-test locally and returns option-specific feedback", async () => {
    const { repository, bodies } = await readyRepository();
    const assessment = await readOfflineLessonAssessment(
      "student-a",
      LESSON_ID,
      repository,
      async (_ownerId, artifact) => bodies.get(artifact.artifactId) ?? null,
    );
    expect(assessment.checkSelfTestAnswer("self-1", "self-rev-1", "a")).toEqual({
      isCorrect: false,
      correctOptionId: "b",
      explanation: "الخيار الثاني هو الصحيح.",
      correction: "راجع الفكرة الأساسية.",
    });
    expect(assessment.checkSelfTestAnswer("self-1", "self-rev-1", "b")).toMatchObject({
      isCorrect: true,
      correction: "أحسنت.",
    });
  });

  it("restores only the current owner's saved attempts after restart", async () => {
    const { repository, bodies } = await readyRepository();
    await saveOfflineOfficialQuestionNote(
      {
        ownerId: "student-a",
        lessonId: LESSON_ID,
        questionId: "official-1",
        revisionId: "official-rev-1",
        answerText: "إجابة محفوظة",
      },
      repository,
      T0,
    );
    await recordOfflineSelfTestAttempt(
      {
        ownerId: "student-a",
        lessonId: LESSON_ID,
        questionId: "self-1",
        revisionId: "self-rev-1",
        selectedOptionId: "a",
        isCorrect: false,
      },
      repository,
      T0,
    );
    const restored = await readOfflineLessonAssessment(
      "student-a",
      LESSON_ID,
      repository,
      async (_ownerId, artifact) => bodies.get(artifact.artifactId) ?? null,
    );
    expect(restored.officialQuestions[0]).toMatchObject({ savedAnswer: "إجابة محفوظة" });
    expect(restored.selfTestQuestions[0]).toMatchObject({
      selectedOptionId: "a",
      isCorrect: false,
    });

    const otherOwner = await readOfflineLessonAssessment(
      "student-b",
      LESSON_ID,
      repository,
      async (_ownerId, artifact) => bodies.get(artifact.artifactId) ?? null,
    );
    expect(otherOwner.officialQuestions).toEqual([]);
  });

  it("fails closed across owners and on tampered bytes", async () => {
    const { repository, bodies } = await readyRepository();
    const otherOwner = await readOfflineLessonAssessment(
      "student-b",
      LESSON_ID,
      repository,
      async (_ownerId, artifact) => bodies.get(artifact.artifactId) ?? null,
    );
    expect(otherOwner.officialQuestions).toEqual([]);
    expect(otherOwner.selfTestQuestions).toEqual([]);

    const tampered = await readOfflineLessonAssessment(
      "student-a",
      LESSON_ID,
      repository,
      async (_ownerId, artifact) =>
        artifact.kind === "assessment"
          ? new TextEncoder().encode('{"tampered":true}')
          : (bodies.get(artifact.artifactId) ?? null),
    );
    expect(tampered.officialQuestions).toEqual([]);
    expect(tampered.selfTestQuestions).toHaveLength(1);
  });
});

describe("OFFLINE-05 durable learning journal and sync", () => {
  it("commits an answer and its replay operation in one durable write", async () => {
    const adapter = new CountingOfflineStateAdapter();
    const repository = new OfflineStateRepository(adapter);
    await saveOfflineOfficialQuestionNote(
      {
        ownerId: "student-a",
        lessonId: LESSON_ID,
        questionId: "official-1",
        answerText: "إجابة ذرّية",
      },
      repository,
      T0,
    );
    expect(adapter.writes).toBe(1);
    const snapshot = await repository.read();
    expect(snapshot.learning).toHaveLength(1);
    expect(snapshot.outbox).toHaveLength(1);
  });

  it("persists official answers per owner and deduplicates an unchanged note", async () => {
    const repository = new OfflineStateRepository(new MemoryOfflineStateAdapter());
    await saveOfflineOfficialQuestionNote(
      {
        ownerId: "student-a",
        lessonId: LESSON_ID,
        questionId: "official-1",
        answerText: "إجابتي المحلية",
      },
      repository,
      T0,
    );
    await saveOfflineOfficialQuestionNote(
      {
        ownerId: "student-a",
        lessonId: LESSON_ID,
        questionId: "official-1",
        answerText: "إجابتي المحلية",
      },
      repository,
      "2026-09-02T00:01:00.000Z",
    );
    expect(await readOfflineOfficialQuestionNotes("student-a", LESSON_ID, repository)).toEqual({
      "official-1": "إجابتي المحلية",
    });
    expect(await readOfflineOfficialQuestionNotes("student-b", LESSON_ID, repository)).toEqual({});
    const snapshot = await repository.read();
    expect(snapshot.learning).toHaveLength(1);
    expect(snapshot.outbox).toHaveLength(1);
  });

  it("records the latest self-test choice and queues the derived score", async () => {
    const repository = new OfflineStateRepository(new MemoryOfflineStateAdapter());
    const first = await recordOfflineSelfTestAttempt(
      {
        ownerId: "student-a",
        lessonId: LESSON_ID,
        questionId: "self-1",
        revisionId: "self-rev-1",
        selectedOptionId: "b",
        isCorrect: true,
      },
      repository,
      T0,
    );
    const second = await recordOfflineSelfTestAttempt(
      {
        ownerId: "student-a",
        lessonId: LESSON_ID,
        questionId: "self-2",
        revisionId: "self-rev-2",
        selectedOptionId: "a",
        isCorrect: false,
      },
      repository,
      "2026-09-02T00:01:00.000Z",
    );
    expect(first.scorePercent).toBe(100);
    expect(second.scorePercent).toBe(50);
    const snapshot = await repository.read();
    expect(snapshot.learning.filter((record) => record.kind === "self-test-attempt")).toHaveLength(
      2,
    );
    expect(snapshot.outbox.map((record) => record.progressPercent)).toEqual([100, 50]);
  });

  it("delivers queued activity once and leaves no claimable duplicate", async () => {
    const repository = new OfflineStateRepository(new MemoryOfflineStateAdapter());
    await saveOfflineOfficialQuestionNote(
      {
        ownerId: "student-a",
        lessonId: LESSON_ID,
        questionId: "official-1",
        answerText: "محاولة",
      },
      repository,
      T0,
    );
    const delivered: string[] = [];
    const first = await syncOfflineOutbox({
      ownerId: "student-a",
      repository,
      now: T0,
      delivery: {
        async deliver(record) {
          delivered.push(record.id);
        },
      },
    });
    expect(first).toEqual({ claimed: 1, delivered: 1, failed: 0 });
    expect(delivered).toHaveLength(1);
    const replay = await syncOfflineOutbox({
      ownerId: "student-a",
      repository,
      now: "2026-09-02T00:05:00.000Z",
      delivery: { async deliver() {} },
    });
    expect(replay).toEqual({ claimed: 0, delivered: 0, failed: 0 });
  });
});
