import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import type { Database } from "../../src/integrations/supabase/types";
import { parseOfflineAssessmentBundle } from "../../src/lib/offline/offline-assessment-contract";
import { loadOfflineAssessmentSource } from "../../src/lib/offline/offline-assessment-source.server";

const LESSON_ID = "11111111-1111-4111-8111-111111111111";
const QUESTION_ID = "22222222-2222-4222-8222-222222222222";
const REVISION_ID = "33333333-3333-4333-8333-333333333333";
const T0 = "2026-09-02T00:00:00.000Z";

type RpcResult = Promise<{ data: unknown; error: { message?: string } | null }>;

function rpcClient(
  handler: (name: string, args: Record<string, unknown>) => RpcResult,
): SupabaseClient<Database> {
  return { rpc: handler } as unknown as SupabaseClient<Database>;
}

function safeRows() {
  return [
    {
      id: QUESTION_ID,
      question_text: "اختر الإجابة الصحيحة.",
      question_type: "mcq",
      sort_order: 1,
      revision_id: REVISION_ID,
      options: [
        { id: "a", text: "الأول", sortOrder: 1 },
        { id: "b", text: "الثاني", sortOrder: 2 },
      ],
    },
  ];
}

function answerLayer(optionIds = ["a", "b"]) {
  return {
    options: optionIds.map((optionId, index) => ({
      revisionId: REVISION_ID,
      optionId,
      isCorrect: optionId === "b",
      sortOrder: index + 1,
    })),
    answers: [
      {
        questionId: QUESTION_ID,
        revisionId: REVISION_ID,
        modelAnswer: "b",
        explanation: "الخيار الثاني صحيح.",
        updatedAt: T0,
      },
    ],
    rationales: [
      {
        questionId: QUESTION_ID,
        revisionId: REVISION_ID,
        optionId: "b",
        whyCorrect: "أحسنت.",
        whyWrong: null,
        updatedAt: T0,
      },
    ],
  };
}

describe("OFFLINE-05 assessment source boundary", () => {
  it("resolves the student-safe rows before attaching the exact private answer layer", async () => {
    const calls: string[] = [];
    const userClient = rpcClient(async (name) => {
      calls.push(`student:${name}`);
      return { data: safeRows(), error: null };
    });
    const answerClient = rpcClient(async (name, args) => {
      calls.push(`service:${name}`);
      expect(args).toEqual({
        _lesson_id: LESSON_ID,
        _kind: "self-test",
        _revision_ids: [REVISION_ID],
      });
      return { data: answerLayer(), error: null };
    });

    const source = await loadOfflineAssessmentSource({
      userClient,
      answerClient,
      lessonId: LESSON_ID,
      kind: "self-test",
      readyAt: T0,
    });

    expect(calls).toEqual([
      "student:get_lesson_self_test_questions",
      "service:get_offline_assessment_answer_layer",
    ]);
    expect(source).not.toBeNull();
    const bundle = parseOfflineAssessmentBundle(source!.body);
    expect(bundle.kind).toBe("self-test");
    if (bundle.kind !== "self-test") throw new Error("unexpected bundle kind");
    expect(bundle.questions[0]).toMatchObject({
      questionId: QUESTION_ID,
      revisionId: REVISION_ID,
      correctOptionId: "b",
      feedbackByOption: {
        b: { whyCorrect: "أحسنت.", whyWrong: null },
      },
    });
  });

  it("fails closed when safe option ids and answer-layer option codes differ", async () => {
    const userClient = rpcClient(async () => ({ data: safeRows(), error: null }));
    const answerClient = rpcClient(async () => ({ data: answerLayer(["a", "c"]), error: null }));

    await expect(
      loadOfflineAssessmentSource({
        userClient,
        answerClient,
        lessonId: LESSON_ID,
        kind: "self-test",
        readyAt: T0,
      }),
    ).rejects.toThrow("OFFLINE_ASSESSMENT_OPTION_BINDING_MISMATCH");
  });
});
