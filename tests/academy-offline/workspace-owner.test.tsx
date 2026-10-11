// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
const auth = vi.hoisted(() => ({
  callbacks: [] as Array<(event: string, session: { user: { id: string } } | null) => void>,
}));
vi.mock("../../apps/teacher-academy/src/lib/supabase", () => ({
  academyFeatureEnabled: false,
  academyBackendConfigured: false,
  supabaseUrl: "https://test.supabase.co",
  supabaseKey: "public",
  academySupabase: {
    schema: () => ({}),
    auth: {
      onAuthStateChange: (callback: (typeof auth.callbacks)[number]) => {
        auth.callbacks.push(callback);
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
  },
}));
vi.mock("../../apps/teacher-academy/src/pwa/AcademyPwaControls", () => ({
  AcademyPwaControls: () => null,
}));
vi.mock("../../apps/teacher-academy/src/offline/AcademyOfflineLibrary", () => ({
  AcademyOfflineLibrary: ({ owner }: { owner: string }) => <p>downloads:{owner}</p>,
}));
import { App } from "../../apps/teacher-academy/src/App";
import { OWNER_KEY, setOwner } from "../../apps/teacher-academy/src/offline/store";
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  localStorage.clear();
  setOwner("teacher-a");
  auth.callbacks = [];
  host = document.createElement("div");
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function mount(portal: "teacher" | "admin" | "verify" = "teacher") {
  await act(async () => root.render(<App portal={portal} />));
}
test("teacher cold-start shows only the saved owner's library", async () => {
  await mount();
  expect(host.textContent).toContain("downloads:teacher-a");
});
test("explicit sign-out revokes the offline display immediately", async () => {
  await mount();
  await act(async () => auth.callbacks.forEach((callback) => callback("SIGNED_OUT", null)));
  expect(host.textContent).not.toContain("downloads:");
  expect(localStorage.getItem(OWNER_KEY)).toBeNull();
});
test("a different authenticated account cannot display the previous owner's library", async () => {
  await mount();
  await act(async () =>
    auth.callbacks.forEach((callback) => callback("SIGNED_IN", { user: { id: "teacher-b" } })),
  );
  expect(host.textContent).not.toContain("downloads:");
  expect(localStorage.getItem(OWNER_KEY)).toBeNull();
});
test("an unavailable initial session does not erase offline downloads ownership", async () => {
  await mount();
  await act(async () => auth.callbacks.forEach((callback) => callback("INITIAL_SESSION", null)));
  expect(host.textContent).toContain("downloads:teacher-a");
});
test.each(["admin", "verify"] as const)(
  "%s workspace never enters a teacher's offline library",
  async (portal) => {
    await mount(portal);
    expect(host.textContent).not.toContain("downloads:");
  },
);
test("a cross-tab owner revocation hides the active offline workspace", async () => {
  await mount();
  await act(async () => {
    localStorage.removeItem(OWNER_KEY);
    window.dispatchEvent(new StorageEvent("storage", { key: OWNER_KEY, newValue: null }));
  });
  expect(host.textContent).not.toContain("downloads:");
});
