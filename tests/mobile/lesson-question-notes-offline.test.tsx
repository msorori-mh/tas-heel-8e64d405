// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, test, vi } from "vitest";
const fixture = vi.hoisted(() => ({
  online: false,
  remote: vi.fn(async () => ({ data: [{ question_id: "q", answer_text: "remote" }], error: null })),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ eq: fixture.remote }) }) },
}));
vi.mock("@/lib/offline/network", () => ({
  getNetworkState: async () => ({ online: fixture.online }),
}));
vi.mock("@/lib/offline/offline-learning-journal", () => ({
  readOfflineOfficialQuestionNotes: async () => ({ q: "saved answer" }),
  saveOfflineOfficialQuestionNote: vi.fn(),
}));
vi.mock("@/lib/offline/offline-sync", () => ({ syncOfflineOutboxForCurrentSession: vi.fn() }));
import { useLessonQuestionNotes } from "../../src/lib/lessons/lesson-question-notes";
const host = document.createElement("div");
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: ReturnType<typeof createRoot>;
let client: QueryClient;
function Notes() {
  const { notes } = useLessonQuestionNotes("lesson", "student");
  return <span>{notes.q}</span>;
}
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  fixture.remote.mockClear();
});
async function mount(online: boolean) {
  fixture.online = online;
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  root = createRoot(host);
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <Notes />
      </QueryClientProvider>,
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  await vi.waitFor(() => expect(host.textContent).toBe("saved answer"));
}
test("saved official answers load offline without a remote read", async () => {
  await mount(false);
  expect(fixture.remote).not.toHaveBeenCalled();
});
test("online notes are read while the locally saved answer takes precedence", async () => {
  await mount(true);
  expect(fixture.remote).toHaveBeenCalledWith("lesson_id", "lesson");
});
