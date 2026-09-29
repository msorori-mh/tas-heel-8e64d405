// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useKeyboardOpen } from "@/hooks/use-keyboard-open";
it("hides navigation only for an editing field with a reduced viewport and restores it on blur", async () => {
  const viewport = Object.assign(new EventTarget(), { height: 820 });
  vi.stubGlobal("visualViewport", viewport);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  function View() {
    const keyboard = useKeyboardOpen();
    return (
      <>
        <input aria-label="الإجابة" />
        <nav hidden={keyboard}>التنقل</nav>
      </>
    );
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<View />));
    const input = host.querySelector("input")!;
    const nav = host.querySelector("nav")!;
    await act(async () => input.focus());
    expect(nav.hidden).toBe(false);
    await act(async () => {
      viewport.height = 450;
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(nav.hidden).toBe(true);
    await act(async () => input.blur());
    expect(nav.hidden).toBe(false);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
