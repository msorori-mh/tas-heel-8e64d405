// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { LessonCapabilityTabs } from "../../src/components/lessons/LessonCapabilityTabs";
import {
  LESSON_CAPABILITY_LABEL_AR,
  type LessonCapability,
  type LessonCapabilityType,
} from "../../src/lib/lessons/lesson-capabilities";
let host: HTMLDivElement, root: Root;
let observe: (entries: Partial<IntersectionObserverEntry>[]) => void;
const disconnect = vi.fn();
const scroll = vi.fn();
const types: LessonCapabilityType[] = [
  "PRIMARY_CONTENT",
  "EXPLANATION",
  "SUMMARY",
  "MINDMAP",
  "PRACTICAL",
  "OFFICIAL_QUESTIONS",
  "SELF_TEST",
];
const actions = types.map((type) => ({
  type,
  label: LESSON_CAPABILITY_LABEL_AR[type],
  description: "TEST_ONLY",
  available: true,
  studentVisible: true,
  trackable: false,
  completed: false,
  count: 1,
  action: "فتح",
  source: "NONE",
})) as LessonCapability[];
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: typeof observe) {
        observe = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  Element.prototype.scrollIntoView = scroll;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function mount() {
  await act(async () =>
    root.render(
      <LessonCapabilityTabs
        actions={actions}
        waitingForPrimary={false}
        renderBody={(item) => <input aria-label={item.type} />}
      />,
    ),
  );
}
function tab(type: string) {
  return host.querySelector<HTMLButtonElement>(`#lesson-tab-${type}`)!;
}
it("reaches the final two components and preserves answers when switching", async () => {
  await mount();
  expect(host.querySelectorAll('[role="tab"]')).toHaveLength(7);
  await act(async () => tab("OFFICIAL_QUESTIONS").click());
  const answer = host.querySelector<HTMLInputElement>('input[aria-label="OFFICIAL_QUESTIONS"]')!;
  answer.value = "إجابتي المحفوظة";
  await act(async () => tab("SELF_TEST").click());
  expect(host.querySelector("#lesson-panel-SELF_TEST")?.hasAttribute("hidden")).toBe(false);
  await act(async () => tab("OFFICIAL_QUESTIONS").click());
  expect(answer.value).toBe("إجابتي المحفوظة");
});
it("returns from long content to the active component without changing it", async () => {
  await mount();
  await act(async () => tab("SELF_TEST").click());
  await act(async () =>
    observe([{ isIntersecting: false, boundingClientRect: { bottom: -20 } as DOMRectReadOnly }]),
  );
  const back = Array.from(host.querySelectorAll("button")).find((button) =>
    button.textContent?.includes("مكونات الدرس"),
  )!;
  await act(async () => back.click());
  expect(scroll).toHaveBeenCalledWith({ block: "start", behavior: "instant" });
  expect(document.activeElement).toBe(tab("SELF_TEST"));
  expect(tab("SELF_TEST").getAttribute("aria-selected")).toBe("true");
  await act(async () =>
    observe([{ isIntersecting: true, boundingClientRect: { bottom: 100 } as DOMRectReadOnly }]),
  );
  expect(host.textContent).not.toContain("مكونات الدرس");
});
it("supports RTL keyboard navigation to both ends", async () => {
  await mount();
  await act(async () =>
    tab("PRIMARY_CONTENT").dispatchEvent(
      new KeyboardEvent("keydown", { key: "End", bubbles: true }),
    ),
  );
  expect(document.activeElement).toBe(tab("SELF_TEST"));
  await act(async () =>
    tab("SELF_TEST").dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    ),
  );
  expect(document.activeElement).toBe(tab("OFFICIAL_QUESTIONS"));
  await act(async () =>
    tab("OFFICIAL_QUESTIONS").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Home", bubbles: true }),
    ),
  );
  expect(document.activeElement).toBe(tab("PRIMARY_CONTENT"));
});
