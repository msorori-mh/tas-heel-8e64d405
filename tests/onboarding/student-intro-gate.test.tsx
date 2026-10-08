// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, test, expect, vi } from "vitest";
const state = vi.hoisted(() => ({ native: true, path: "/", get: vi.fn(), set: vi.fn() }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => state.native } }));
vi.mock("@capacitor/preferences", () => ({ Preferences: { get: state.get, set: state.set } }));
vi.mock("@tanstack/react-router", () => ({ useRouterState: () => state.path }));
import { StudentIntroGate } from "../../src/components/onboarding/StudentIntroGate";
import { INTRO_KEY } from "../../src/lib/onboarding/student-intro";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, React });
let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.replaceChildren();
  vi.clearAllMocks();
});
async function open(value: string | null, native = true, path = "/") {
  state.native = native;
  state.path = path;
  state.get.mockResolvedValue({ value });
  state.set.mockResolvedValue(undefined);
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(
      <StudentIntroGate>
        <div id="application">Application</div>
      </StudentIntroGate>,
    ),
  );
}
test("first native launch holds application until skip persists completion", async () => {
  await open(null);
  expect(document.querySelector(".tamkeen-intro")).not.toBeNull();
  expect(document.querySelector("#application")).toBeNull();
  await act(async () => document.querySelector<HTMLButtonElement>(".intro-skip")!.click());
  expect(state.set).toHaveBeenCalledWith({ key: INTRO_KEY, value: "done" });
  expect(document.querySelector("#application")).not.toBeNull();
});
test("returning native launch does not show tour", async () => {
  await open("done");
  expect(document.querySelector(".tamkeen-intro")).toBeNull();
  expect(document.querySelector("#application")).not.toBeNull();
});
test("web and administrative routes bypass device tour", async () => {
  await open(null, false);
  expect(state.get).not.toHaveBeenCalled();
  expect(document.querySelector("#application")).not.toBeNull();
});
test("native OAuth callback bypasses tour", async () => {
  await open(null, true, "/auth/callback");
  expect(state.get).not.toHaveBeenCalled();
  expect(document.querySelector("#application")).not.toBeNull();
});
test("preference write failure still allows entry", async () => {
  await open(null);
  state.set.mockRejectedValue(new Error("Unavailable"));
  await act(async () => document.querySelector<HTMLButtonElement>(".intro-skip")!.click());
  expect(document.querySelector(".tamkeen-intro")).toBeNull();
  expect(document.querySelector("#application")).not.toBeNull();
});
