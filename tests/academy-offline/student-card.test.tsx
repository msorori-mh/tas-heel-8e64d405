// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
const fixture = vi.hoisted(() => ({ packs: [] as { ownerId: string; status: string }[] }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "student-a" } }) }));
vi.mock("@/lib/offline/offline-state-store", () => ({
  deviceOfflineStateRepository: { read: async () => ({ packs: fixture.packs }) },
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    hash,
    children,
    ...props
  }: {
    to: string;
    hash: string;
    children: React.ReactNode;
  }) => (
    <a href={`${to}#${hash}`} {...props}>
      {children}
    </a>
  ),
}));
import { OfflineDownloadNotice } from "@/components/home/OfflineDownloadNotice";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
const disposers: Array<() => void> = [];
afterEach(() => {
  disposers.splice(0).forEach((fn) => fn());
  fixture.packs = [];
});
async function render() {
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element);
  disposers.push(() => {
    act(() => root.unmount());
    element.remove();
  });
  await act(async () => root.render(<OfflineDownloadNotice />));
  return element;
}
test("home CTA opens offline settings and does not count another student's packs", async () => {
  fixture.packs = [{ ownerId: "student-b", status: "ready" }];
  const el = await render();
  expect(el.querySelector("a")?.getAttribute("href")).toBe("/settings#offline");
  expect(el.textContent).toContain("تحميل المحتوى");
  expect(el.textContent).not.toContain("حزم محفوظة");
});
test("an incomplete owned download offers resume without claiming all content is ready", async () => {
  fixture.packs = [{ ownerId: "student-a", status: "failed" }];
  const el = await render();
  expect(el.textContent).toContain("استكمال التنزيل");
  expect(el.textContent).not.toContain("محتواك جاهز");
});
