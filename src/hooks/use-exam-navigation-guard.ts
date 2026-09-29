import { useBlocker } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

const SIGN_OUT_EVENT = "tamkeen:before-student-sign-out";
const MESSAGE =
  "هل تريد مغادرة الاختبار؟ تأكد من حفظ إجابتك الحالية. لن تُسلَّم المحاولة تلقائيًا، وقد يستمر المؤقت.";

export function requestStudentSignOut(): boolean {
  return window.dispatchEvent(new Event(SIGN_OUT_EVENT, { cancelable: true }));
}

export function useExamNavigationGuard(active: boolean) {
  const leaving = useRef(false);
  useBlocker({
    shouldBlockFn: ({ current, next }) =>
      active && !leaving.current && current.pathname !== next.pathname && !window.confirm(MESSAGE),
    enableBeforeUnload: () => active && !leaving.current,
  });
  useEffect(() => {
    if (!active) leaving.current = false;
    const check = (event: Event) => {
      if (!active) return;
      if (!window.confirm(MESSAGE)) event.preventDefault();
      else leaving.current = true;
    };
    window.addEventListener(SIGN_OUT_EVENT, check);
    return () => window.removeEventListener(SIGN_OUT_EVENT, check);
  }, [active]);
}
