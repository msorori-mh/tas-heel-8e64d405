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
  window.scrollTo = vi.fn();
  localStorage.clear();
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
it("offers sequential navigation without a floating return overlay", async () => {
  await mount();
  const next = Array.from(host.querySelectorAll("button")).find((button) =>
    button.textContent?.startsWith("التالي:"),
  )!;
  await act(async () => next.click());
  expect(tab("EXPLANATION").getAttribute("aria-selected")).toBe("true");
  expect(host.querySelector(".lesson-return-button")).toBeNull();
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

it("keeps lesson navigation usable without IntersectionObserver", async () => {
  vi.stubGlobal("IntersectionObserver", undefined);
  await mount();
  await act(async () => tab("SELF_TEST").click());
  expect(tab("SELF_TEST").getAttribute("aria-selected")).toBe("true");
  expect(host.querySelectorAll('[role="tab"]')).toHaveLength(7);
});

it("restores the saved component for the supplied student and lesson only", async () => {
  localStorage.setItem(
    "reader:student-a:lesson-a",
    JSON.stringify({ type: "SUMMARY", positions: { SUMMARY: 320 } }),
  );
  await act(async () =>
    root.render(
      <LessonCapabilityTabs
        readingKey="reader:student-a:lesson-a"
        actions={actions}
        waitingForPrimary={false}
        renderBody={(item) => <p>{item.type}</p>}
      />,
    ),
  );
  expect(tab("SUMMARY").getAttribute("aria-selected")).toBe("true");
  await act(async () =>
    root.render(
      <LessonCapabilityTabs
        key="student-b"
        readingKey="reader:student-b:lesson-a"
        actions={actions}
        waitingForPrimary={false}
        renderBody={(item) => <p>{item.type}</p>}
      />,
    ),
  );
  expect(tab("PRIMARY_CONTENT").getAttribute("aria-selected")).toBe("true");
});
