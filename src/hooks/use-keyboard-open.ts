import { useEffect, useState } from "react";

/** Collapse fixed navigation while an input is using the mobile viewport. */
export function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const viewport = window.visualViewport;
    let baseline = viewport?.height ?? window.innerHeight;
    const update = () => {
      const input = document.activeElement;
      const editing =
        input instanceof HTMLElement &&
        (input.matches(
          "input:not([type=button]):not([type=checkbox]):not([type=radio]), textarea",
        ) ||
          input.isContentEditable);
      const height = viewport?.height ?? window.innerHeight;
      if (!editing) baseline = Math.max(baseline, height);
      setOpen(editing && baseline - height > 100);
    };
    viewport?.addEventListener("resize", update);
    window.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
    };
  }, []);
  return open;
}
