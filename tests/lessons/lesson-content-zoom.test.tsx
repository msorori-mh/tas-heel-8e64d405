// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { InlineHtmlResourceViewer } from "@/components/lessons/InlineHtmlResourceViewer";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
const mounted: Array<() => void> = [];
afterEach(() => mounted.splice(0).forEach((dispose) => dispose()));

test.each(["official", "explanation", "summary", "mindmap", "experiment"])(
  "%s zoom preserves the frame, content and isolation",
  async (resourceType) => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    mounted.push(() => {
      act(() => root.unmount());
      container.remove();
    });
    const render = (html: string) =>
      root.render(
        <InlineHtmlResourceViewer
          title="درس"
          html={html}
          htmlResourceType="STATIC"
          resourceType={resourceType}
        />,
      );
    await act(async () => render("<p>محتوى الدرس</p>"));
    const frame = container.querySelector("iframe")!;
    const originalDocument = frame.getAttribute("srcdoc");
    const originalSandbox = frame.getAttribute("sandbox");
    const click = async (label: string) =>
      act(async () =>
        (container.querySelector(`[aria-label="${label}"]`) as HTMLButtonElement).click(),
      );
    const viewport = container.querySelector("[data-lesson-zoom]")!;
    const gesture = async (phase: string, factor = 1) =>
      act(async () => {
        viewport.dispatchEvent(
          new CustomEvent("tamkeen:lesson-pinch", { detail: { phase, factor } }),
        );
      });
    await gesture("scale", 2); // Unstarted/stale gestures must not change content.
    expect(container.querySelector("output")?.textContent).toBe("100%");
    await gesture("start");
    await gesture("scale", 2);
    expect(container.querySelector("output")?.textContent).toBe("200%");
    await gesture("scale", NaN);
    await gesture("scale", -1);
    expect(container.querySelector("output")?.textContent).toBe("200%");
    await gesture("scale", 4);
    expect(container.querySelector("output")?.textContent).toBe("300%");
    await gesture("scale", 0.1);
    expect(container.querySelector("output")?.textContent).toBe("100%");
    await gesture("end");
    await gesture("scale", 2);
    expect(container.querySelector("output")?.textContent).toBe("100%");
    await click("تكبير المحتوى");
    expect(container.querySelector("output")?.textContent).toBe("125%");
    expect(frame.parentElement?.style.transform).toBe("scale(1.25)");
    expect(frame.parentElement?.style.transformOrigin).toBe("top right");
    expect(container.querySelector("iframe")).toBe(frame);
    expect(frame.getAttribute("srcdoc")).toBe(originalDocument);
    expect(frame.getAttribute("sandbox")).toBe(originalSandbox);
    expect(originalSandbox).not.toContain("allow-same-origin");
    for (let i = 0; i < 12; i++) await click("تكبير المحتوى");
    expect(container.querySelector("output")?.textContent).toBe("300%");
    expect(
      (container.querySelector('[aria-label="تكبير المحتوى"]') as HTMLButtonElement).disabled,
    ).toBe(true);
    await click("إعادة الحجم الأصلي");
    expect(container.querySelector("output")?.textContent).toBe("100%");
    await click("تكبير المحتوى");
    await act(async () => render("<p>درس آخر</p>"));
    expect(container.querySelector("output")?.textContent).toBe("100%");
  },
);
