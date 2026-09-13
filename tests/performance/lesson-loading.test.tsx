// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any -- The fixture implements dynamic PostgREST builders and router boundaries. */
import { act, createElement, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { beforeEach, afterEach, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  offline: vi.fn(),
  gate: vi.fn(),
  lessonId: "lesson-1",
  userId: "student-1",
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useParams: () => ({ lessonId: api.lessonId }),
    useSearch: () => ({}),
  }),
  Link: ({ children, to }: any) => <a href={to}>{children}</a>,
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    profile: { user_id: api.userId, grade_uuid: "grade-1" },
    isContentStaff: false,
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: api }));
vi.mock("@/lib/offline/offline-pack", () => ({ prefetchNextLessons: async () => 0 }));
vi.mock("@/lib/offline/offline-lesson-content", () => ({ readOfflineLessonContent: api.offline }));
vi.mock("@/lib/offline/offline-assessment-engine", () => ({
  readOfflineLessonAssessment: async () => null,
}));
vi.mock("@/lib/offline/offline-learning-journal", () => ({
  recordOfflineSelfTestAttempt: vi.fn(),
}));
vi.mock("@/lib/lessons/lesson-question-notes", () => ({
  useLessonQuestionNotes: () => ({ notes: {}, saveNote: vi.fn() }),
}));
vi.mock("@/lib/api/lesson-file.functions", () => ({ getLessonFileUrl: vi.fn() }));
vi.mock("@/lib/api/html-pipeline.functions", () => ({
  getLessonPublishedHtmlResourcesFn: vi.fn(),
  createSignedStudentAccessUrlFn: vi.fn(),
  requestFreshStudentHtmlSignedUrl: vi.fn(),
}));
vi.mock("@/components/lessons/InAppPdfDelivery", () => ({ InAppPdfDelivery: () => null }));
vi.mock("@/components/lessons/ExternalLessonDelivery", () => ({
  ExternalLessonDelivery: () => null,
}));
vi.mock("@/components/lessons/PublishedHtmlResourceViewer", () => ({
  PublishedHtmlResourceViewer: () => null,
}));
vi.mock("@/lib/lessons/lesson-lifecycle", async (original) => ({
  ...(await original<any>()),
  fetchStudentLifecycleGate: api.gate,
}));
import { Route } from "../../src/routes/_authenticated/lessons.$lessonId";

function deferred<T = any>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
let root: Root, host: HTMLDivElement, client: QueryClient;
let book: ReturnType<typeof deferred>, explanation: ReturnType<typeof deferred>;
let requests: { table: string; columns: string; lesson: string; signal?: AbortSignal }[];
let explanationExists: boolean;
const rows = [
  { id: "explanation-1", title: "الشرح", content: "شرح محفوظ من الخادم", sort_order: 0 },
];
const fullRequests = () =>
  requests.filter((r) => r.table === "lesson_explanations" && r.columns.includes("content"));
const mount = async () => {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        {createElement(Route.options.component as ComponentType)}
      </QueryClientProvider>,
    ),
  );
  await flush();
};
async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20);
  });
}
async function click(type: string) {
  const target = host.querySelector<HTMLButtonElement>(`#lesson-tab-${type}`);
  expect(target).not.toBeNull();
  await act(async () => target!.click());
  await flush();
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  onlineManager.setOnline(true);
  api.userId = "student-1";
  api.lessonId = "lesson-1";
  book = deferred();
  explanation = deferred();
  requests = [];
  explanationExists = true;
  api.offline.mockResolvedValue(null);
  api.gate.mockResolvedValue({ managed: false, visible: true, readyKeys: new Set() });
  api.rpc.mockResolvedValue({ data: [], error: null });
  api.from.mockImplementation((table: string) => {
    const query = {
      table,
      columns: "",
      lesson: api.lessonId,
      signal: undefined as AbortSignal | undefined,
    };
    let single = false;
    const builder: any = {
      select: (columns: string) => {
        query.columns = columns;
        return builder;
      },
      eq: (field: string, value: string) => {
        if (field === "lesson_id" || (table === "lessons" && field === "id")) query.lesson = value;
        return builder;
      },
      order: () => builder,
      not: () => builder,
      abortSignal: (signal: AbortSignal) => {
        query.signal = signal;
        return builder;
      },
      maybeSingle: () => {
        single = true;
        return builder;
      },
      then: (resolve: any, reject: any) => {
        requests.push(query);
        let result: any = [];
        if (table === "lessons")
          result = single
            ? {
                id: query.lesson,
                subject_id: "subject-1",
                title: "درس الاختبار",
                content_text: null,
              }
            : [];
        if (table === "subjects") result = { id: "subject-1", name: "المادة", grade_id: "grade-1" };
        if (table === "lesson_book_contents") return book.promise.then(resolve, reject);
        if (table === "lesson_explanations") {
          if (query.columns.includes("content")) return explanation.promise.then(resolve, reject);
          result = explanationExists ? [{ id: "explanation-1" }] : [];
        }
        if (
          ["lesson_summaries", "user_progress"].includes(table) ||
          (table === "lesson_resources" && single)
        )
          result = null;
        return Promise.resolve({ data: result, error: null }).then(resolve, reject);
      },
    };
    return builder;
  });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  onlineManager.setOnline(true);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("discovers the explanation tab without downloading its body while the book is slow", async () => {
  await mount();
  expect(fullRequests()).toHaveLength(0);
  expect(host.querySelector("#lesson-tab-EXPLANATION")).not.toBeNull();
  expect(host.textContent).toContain("جارٍ تحميل محتوى الدرس");
  expect(fullRequests()).toHaveLength(0);
  await act(async () => book.resolve({ data: { content: "المحتوى الأساسي للدرس" }, error: null }));
  await flush();
  expect(host.querySelector("#lesson-tab-PRIMARY_CONTENT")?.getAttribute("aria-selected")).toBe(
    "true",
  );
  expect(fullRequests()).toHaveLength(0);
  await click("EXPLANATION");
  expect(fullRequests()).toHaveLength(1);
  expect(host.textContent).toContain("جارٍ تحميل الشرح");
  await act(async () => explanation.resolve({ data: rows, error: null }));
  await flush();
  expect(host.textContent).toContain(rows[0].content);
  await click("PRIMARY_CONTENT");
  await click("EXPLANATION");
  expect(fullRequests()).toHaveLength(1);
});
it("allows choosing the explanation immediately and does not switch away when the book arrives", async () => {
  await mount();
  await click("EXPLANATION");
  expect(fullRequests()).toHaveLength(1);
  await act(async () => book.resolve({ data: { content: "المحتوى الأساسي" }, error: null }));
  await flush();
  expect(host.querySelector("#lesson-tab-EXPLANATION")?.getAttribute("aria-selected")).toBe("true");
});
it("automatically opens an explanation-only lesson after confirming no book exists", async () => {
  await mount();
  await act(async () => book.resolve({ data: null, error: null }));
  await flush();
  expect(fullRequests()).toHaveLength(1);
  expect(host.querySelector("#lesson-tab-EXPLANATION")?.getAttribute("aria-selected")).toBe("true");
});
it("shows a retryable error without losing the explanation tab", async () => {
  await mount();
  await click("EXPLANATION");
  await act(async () =>
    explanation.resolve({ data: null, error: { message: "connection failed" } }),
  );
  await flush();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("تعذّر تحميل الشرح");
  explanation = deferred();
  const retry = [...host.querySelectorAll("button")].find(
    (b) => b.textContent === "إعادة المحاولة",
  )!;
  await act(async () => retry.click());
  await flush();
  await act(async () => explanation.resolve({ data: rows, error: null }));
  await flush();
  expect(host.textContent).toContain(rows[0].content);
  expect(fullRequests()).toHaveLength(2);
});
it("keeps the editorial gate authoritative for an unpublished explanation", async () => {
  api.gate.mockResolvedValue({
    managed: true,
    visible: true,
    readyKeys: new Set(["officialBook"]),
  });
  await mount();
  await act(async () => book.resolve({ data: { content: "المحتوى الأساسي" }, error: null }));
  await flush();
  expect(host.querySelector("#lesson-tab-EXPLANATION")).toBeNull();
  expect(fullRequests()).toHaveLength(0);
});
it("does not invent an explanation tab when the index is empty", async () => {
  explanationExists = false;
  await mount();
  await act(async () => book.resolve({ data: { content: "المحتوى الأساسي" }, error: null }));
  await flush();
  expect(host.querySelector("#lesson-tab-EXPLANATION")).toBeNull();
  expect(fullRequests()).toHaveLength(0);
});
it("renders the verified account's offline explanation while the remote request is paused", async () => {
  api.offline.mockResolvedValue({
    lessonTitle: "درس الاختبار",
    subjectId: "subject-1",
    subjectTitle: "المادة",
    gradeId: "grade-1",
    officialBook: { body: "كتاب محفوظ" },
    summaries: [],
    explanations: [
      {
        sourceId: "offline-explanation",
        title: "شرح محفوظ",
        body: "النص المحفوظ دون إنترنت",
        sortOrder: 0,
      },
    ],
    mindMaps: [],
    experiments: [],
  });
  onlineManager.setOnline(false);
  await mount();
  await click("EXPLANATION");
  expect(host.textContent).toContain("النص المحفوظ دون إنترنت");
  expect(fullRequests()).toHaveLength(0);
});
it("reuses a recently opened book for the same account, but isolates another account", async () => {
  await mount();
  await act(async () => book.resolve({ data: { content: "المحتوى الأساسي" }, error: null }));
  await flush();
  await act(async () => root.render(null));
  await mount();
  expect(requests.filter((r) => r.table === "lesson_book_contents")).toHaveLength(1);
  api.userId = "student-2";
  await mount();
  expect(requests.filter((r) => r.table === "lesson_book_contents")).toHaveLength(2);
});
it("cancels an unfinished book and explanation when leaving the lesson", async () => {
  await mount();
  await click("EXPLANATION");
  const inflight = requests.filter(
    (r) =>
      r.table === "lesson_book_contents" ||
      (r.table === "lesson_explanations" && r.columns.includes("content")),
  );
  await act(async () => root.render(null));
  expect(inflight).toHaveLength(2);
  expect(inflight.every((r) => r.signal?.aborted)).toBe(true);
});
