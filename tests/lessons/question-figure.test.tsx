// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QuestionFigure } from "../../src/components/lessons/QuestionFigure";

const image = {
  src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
  alt: "مثلث قائم ضلعاه ٣ سم و٤ سم",
};
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function render(value: unknown) {
  await act(async () => root.render(<QuestionFigure image={value} />));
}
async function click(label: string) {
  const button = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  expect(button).not.toBeNull();
  await act(async () => button.click());
}

it("leaves text-only questions without empty figure space", async () => {
  await render(undefined);
  expect(host.innerHTML).toBe("");
  await render(null);
  expect(host.innerHTML).toBe("");
});
it("renders safe embedded bytes and opens the accessible image dialog", async () => {
  await render(image);
  expect(host.querySelector("img")?.src).toBe(image.src);
  expect(host.querySelector("img")?.alt).toBe(image.alt);
  await click(`تكبير صورة السؤال: ${image.alt}`);
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  expect(document.querySelector("output")?.textContent).toBe("100%");
  expect(document.querySelector('[role="dialog"] img')?.getAttribute("src")).toBe(image.src);
});
it("zooms in and out within 100–400 percent and resets on reopening", async () => {
  await render(image);
  await click(`تكبير صورة السؤال: ${image.alt}`);
  for (let i = 0; i < 8; i++) await click("زيادة تكبير الصورة");
  expect(document.querySelector("output")?.textContent).toBe("400%");
  expect(
    document.querySelector<HTMLButtonElement>('[aria-label="زيادة تكبير الصورة"]')?.disabled,
  ).toBe(true);
  for (let i = 0; i < 8; i++) await click("تقليل تكبير الصورة");
  expect(document.querySelector("output")?.textContent).toBe("100%");
  await act(async () =>
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
  );
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
it("never creates an img element for a remote or active source", async () => {
  for (const src of [
    "https://example.org/image.png",
    "javascript:alert(1)",
    "data:image/svg+xml;base64,PHN2Zy8+",
  ]) {
    await render({ src, alt: "رسم" });
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
  }
});
it("reports decode failure instead of displaying an empty figure", async () => {
  await render(image);
  await act(async () => host.querySelector("img")!.dispatchEvent(new Event("error")));
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("تعذّر عرض صورة السؤال");
  expect(host.querySelector("img")).toBeNull();
});
