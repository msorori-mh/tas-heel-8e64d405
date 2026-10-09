// src/lib/onboarding/student-intro.ts
var INTRO_KEY = "tamkeen.student-intro.v1";
var INTRO_SLIDES = [
  {
    kind: "brand",
    title: "\u0645\u0646\u0647\u062C\u0643 \u0628\u064A\u0646 \u064A\u062F\u064A\u0643",
    text: "\u0634\u0631\u062D \u0648\u0627\u0636\u062D \u0644\u0643\u0644 \u062F\u0631\u0633\u060C \u0648\u062D\u0644 \u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u0643\u062A\u0627\u0628 \u062E\u0637\u0648\u0629 \u0628\u062E\u0637\u0648\u0629\u060C \u0648\u062A\u062F\u0631\u064A\u0628 \u064A\u062B\u0628\u0651\u062A \u0645\u0627 \u062A\u0639\u0644\u0651\u0645\u062A\u0647.",
  },
  {
    kind: "offline",
    title:
      "\u062A\u0639\u0644\u0651\u0645 \u062D\u062A\u0649 \u062F\u0648\u0646 \u0625\u0646\u062A\u0631\u0646\u062A",
    text: "\u0646\u0632\u0651\u0644 \u062F\u0631\u0648\u0633\u0643 \u0648\u0623\u0646\u062A \u0645\u062A\u0635\u0644\u060C \u0648\u0648\u0627\u0635\u0644 \u0627\u0644\u062A\u0639\u0644\u0651\u0645 \u0639\u0646\u062F\u0645\u0627 \u064A\u0646\u0642\u0637\u0639 \u0627\u0644\u0625\u0646\u062A\u0631\u0646\u062A.",
  },
  {
    kind: "practice",
    title:
      "\u062A\u062F\u0631\u0651\u0628 \u0648\u0627\u0639\u0631\u0641 \u0623\u062E\u0637\u0627\u0621\u0643",
    text: "\u0627\u062E\u062A\u0628\u0631 \u0641\u0647\u0645\u0643 \u0628\u0639\u062F \u0643\u0644 \u062F\u0631\u0633\u060C \u0648\u0631\u0627\u062C\u0639 \u0623\u062E\u0637\u0627\u0621\u0643 \u0641\u064A \u062F\u0641\u062A\u0631 \u064A\u062C\u0645\u0639\u0647\u0627 \u0644\u0643\u060C \u0648\u062A\u062F\u0631\u0651\u0628 \u0639\u0644\u0649 \u0627\u0644\u0646\u0645\u0627\u0630\u062C \u0627\u0644\u0648\u0632\u0627\u0631\u064A\u0629.",
  },
  {
    kind: "deeper",
    title:
      "\u0627\u0641\u0647\u0645 \u0623\u0639\u0645\u0642\u2026 \u0648\u062C\u0631\u0651\u0628 \u0628\u0646\u0641\u0633\u0643",
    text: "\u062E\u0631\u0627\u0626\u0637 \u0630\u0647\u0646\u064A\u0629 \u062A\u0631\u0628\u0637 \u0623\u0641\u0643\u0627\u0631 \u0627\u0644\u062F\u0631\u0633\u060C \u0648\u0645\u0639\u0645\u0644 \u0627\u0641\u062A\u0631\u0627\u0636\u064A \u062A\u062A\u0641\u0627\u0639\u0644 \u0641\u064A\u0647 \u0645\u0639 \u0627\u0644\u062A\u062C\u0631\u0628\u0629 \u0648\u062A\u0631\u0649 \u0646\u062A\u0627\u0626\u062C\u0647\u0627.",
  },
];
var art = {
  brand:
    '<rect x="116" y="29" width="128" height="128" rx="32" fill="#1E2A63" stroke="none"/><g transform="translate(116 29) scale(.25)"><path d="M140.516 269.938 L220.160 357.547 L371.484 190.293" fill="none" stroke="#FFFFFF" stroke-width="55.751"/><circle cx="160.427" cy="158.436" r="31.858" fill="#2FD0C5" stroke="none"/><circle cx="248.036" cy="158.436" r="31.858" fill="#FF7A6B" stroke="none"/></g><text x="180" y="207" text-anchor="middle" fill="#1E2A63" stroke="none" font-size="26" font-weight="700" font-family="system-ui,sans-serif">\u062A\u0645\u0643\u064A\u0646</text>',
  offline:
    '<rect x="106" y="26" width="148" height="225" rx="24" fill="white"/><path d="M159 44h42"/><circle cx="180" cy="130" r="54" fill="#cff5ef" stroke="none"/><path d="M180 96v63m-23-23 23 23 23-23M151 182h58"/><circle cx="246" cy="196" r="27" fill="#1E2A63"/><path d="m234 196 8 8 17-20" stroke="white"/>',
  practice:
    '<rect x="63" y="33" width="194" height="211" rx="20" fill="white"/><rect x="111" y="24" width="98" height="27" rx="10" fill="#1E2A63"/><path d="M98 79h124M133 112h89m-89 43h89m-89 43h89"/><circle cx="106" cy="111" r="12" fill="#cff5ef"/><circle cx="106" cy="155" r="12" fill="#ffe1dc"/><circle cx="106" cy="198" r="12" fill="#cff5ef"/><path d="m99 110 5 5 10-11m-15 93 5 5 10-11"/><path d="m100 149 12 12m0-12-12 12" stroke="#c2412f"/><rect x="236" y="120" width="88" height="112" rx="14" fill="#fff1ee"/><path d="M252 146h56M252 170h56M252 194h36" stroke="#c2412f"/><circle cx="312" cy="128" r="18" fill="#fb6050" stroke="none"/><path d="M312 119v11m0 7h.01" stroke="white" stroke-width="4.5"/>',
  deeper:
    '<path d="M88 135 56 72m32 63-32 63m32-63 64-63" stroke="#06b6d4"/><rect x="16" y="50" width="80" height="36" rx="12" fill="white"/><rect x="16" y="184" width="80" height="36" rx="12" fill="white"/><rect x="112" y="36" width="80" height="36" rx="12" fill="white"/><path d="M34 68h44M34 202h44M130 54h44"/><rect x="40" y="113" width="96" height="44" rx="15" fill="#1E2A63"/><rect x="196" y="225" width="148" height="14" rx="7" fill="#1E2A63"/><path d="M244 99h27v38l43 57c6 10 0 17-12 17h-88c-12 0-18-7-12-17l42-57Z" fill="white"/><path d="m223 166-20 30c-3 6 0 10 8 10h92c8 0 11-4 8-10l-22-30Z" fill="#06b6d4" stroke="none"/><circle cx="247" cy="183" r="5" fill="white" stroke="none"/><circle cx="271" cy="193" r="7" fill="white" stroke="none"/><path d="M300 52h16m-8-8v16M330 92h12m-6-6v12" stroke="#06b6d4"/>',
};
var css = `
.tamkeen-intro{position:fixed;inset:0;z-index:1000;overflow:auto;background:#FBFAF7;color:#172041;font:16px/1.7 system-ui,sans-serif;direction:rtl;padding: var(--intro-top-padding,max(24px,var(--safe-area-inset-top,env(safe-area-inset-top,0px)))) 20px max(24px,var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px)));box-sizing:border-box}
.tamkeen-intro *{box-sizing:border-box}.tamkeen-intro [hidden]{display:none!important}
.tamkeen-intro .intro-wrap{max-width:480px;margin:auto;min-height:calc(100dvh - var(--intro-top-padding,max(24px,var(--safe-area-inset-top,env(safe-area-inset-top,0px)))) - max(24px,var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px))));display:flex;flex-direction:column}
.tamkeen-intro button{font:inherit;cursor:pointer;min-height:44px;border:0;border-radius:16px}
.tamkeen-intro .intro-top{display:flex;justify-content:flex-end;min-height:44px}
.tamkeen-intro .intro-skip{height:44px;border-radius:24px;background:#EEF0F7;color:#1E2A63;padding:8px 20px;font-size:15px;font-weight:600}
.tamkeen-intro .intro-stage{flex:1;display:flex;flex-direction:column;justify-content:center;text-align:center;touch-action:pan-y pinch-zoom;padding:24px 0}
.tamkeen-intro .intro-art{display:block;width:300px;height:240px;max-width:100%;flex-shrink:0;border-radius:28px;background:#EEF0F8;margin:0 auto 28px}
.tamkeen-intro h1{font-size:28px;line-height:1.5;margin:0 0 16px;font-weight:700}
.tamkeen-intro p{font-size:17px;color:#4F5873;margin:0;line-height:1.9}
.tamkeen-intro .intro-dots{display:flex;justify-content:center;gap:0;margin:8px 0 12px}
.tamkeen-intro .intro-dots button{width:44px;height:44px;background:transparent;padding:0;display:flex;align-items:center;justify-content:center}
.tamkeen-intro .intro-dots i{display:block;height:8px;width:8px;background:#C9CEDD;border-radius:10px}
.tamkeen-intro .intro-dots [aria-current=true] i{background:#1E2A63;width:22px}
.tamkeen-intro .intro-actions{display:flex;gap:10px}
.tamkeen-intro .intro-actions button{min-height:54px}
.tamkeen-intro .intro-next{background:#1E2A63;color:white;flex:1;padding:12px 20px;font-weight:700}
.tamkeen-intro .intro-prev{background:#EEF0F7;color:#1E2A63;padding:12px 20px}
.tamkeen-intro .intro-warning{font-size:13px;color:#765600;margin:8px 0}
.tamkeen-intro .intro-warning:empty{display:none}
.tamkeen-intro button:focus-visible{outline:3px solid #06b6d4;outline-offset:3px}
@media(min-width:600px){.tamkeen-intro .intro-wrap{max-width:560px}.tamkeen-intro .intro-art{width:400px;height:320px}.tamkeen-intro h1{font-size:34px}.tamkeen-intro p{font-size:20px}.tamkeen-intro .intro-actions button{min-height:60px}}
`;
function mountStudentIntro(onComplete, replay = false) {
  const previousFocus = document.activeElement;
  const previousOverflow = document.body.style.overflow;
  const host = document.createElement("section");
  host.className = "tamkeen-intro";
  host.dir = "rtl";
  const nativeBridge = window.Capacitor;
  const android = navigator.userAgent.match(/Android\s+(\d+)/);
  if (
    nativeBridge?.isNativePlatform?.() &&
    nativeBridge.getPlatform?.() === "android" &&
    android &&
    Number(android[1]) >= 15 &&
    !document.documentElement.classList.contains("native-status-inset-consumed")
  ) {
    host.style.setProperty(
      "--intro-top-padding",
      "max(32px, var(--safe-area-inset-top, env(safe-area-inset-top, 0px)))",
    );
  }
  host.setAttribute("role", "dialog");
  host.setAttribute("aria-modal", "true");
  host.setAttribute(
    "aria-label",
    "\u062C\u0648\u0644\u0629 \u062A\u0639\u0631\u064A\u0641\u064A\u0629 \u0628\u062A\u0637\u0628\u064A\u0642 \u062A\u0645\u0643\u064A\u0646",
  );
  host.innerHTML = `<style>${css}</style><div class="intro-wrap"><header class="intro-top"><button class="intro-skip">${replay ? "\u0625\u063A\u0644\u0627\u0642" : "\u062A\u062E\u0637\u0651\u064A"}</button></header><div class="intro-stage"></div><nav class="intro-dots" aria-label="\u0635\u0641\u062D\u0627\u062A \u0627\u0644\u062C\u0648\u0644\u0629"></nav><p class="intro-warning" role="status"></p><footer><div class="intro-actions"><button class="intro-prev">\u0627\u0644\u0633\u0627\u0628\u0642</button><button class="intro-next">\u0627\u0644\u062A\u0627\u0644\u064A</button></div></footer></div>`;
  document.body.append(host);
  document.body.style.overflow = "hidden";
  const stage = host.querySelector(".intro-stage");
  const dots = host.querySelector(".intro-dots");
  const next = host.querySelector(".intro-next");
  const prev = host.querySelector(".intro-prev");
  const skip = host.querySelector(".intro-skip");
  let index = 0;
  let busy = false;
  let removed = false;
  const cleanup = () => {
    if (removed) return;
    removed = true;
    window.removeEventListener("tamkeen:intro-back", back);
    host.remove();
    document.body.style.overflow = previousOverflow;
    previousFocus?.focus();
  };
  async function finish() {
    if (busy) return;
    busy = true;
    next.disabled = skip.disabled = true;
    try {
      await onComplete();
      cleanup();
    } catch {
      if (!removed)
        host.querySelector(".intro-warning").textContent =
          "\u062A\u0639\u0630\u0651\u0631 \u062D\u0641\u0638 \u0625\u0643\u0645\u0627\u0644 \u0627\u0644\u062C\u0648\u0644\u0629. \u064A\u0645\u0643\u0646\u0643 \u0627\u0644\u0645\u062A\u0627\u0628\u0639\u0629\u060C \u0648\u0642\u062F \u062A\u0638\u0647\u0631 \u0627\u0644\u062C\u0648\u0644\u0629 \u0639\u0646\u062F \u0627\u0644\u062A\u0634\u063A\u064A\u0644 \u0627\u0644\u0642\u0627\u062F\u0645.";
    } finally {
      busy = false;
      next.disabled = skip.disabled = false;
    }
  }
  function render() {
    const slide = INTRO_SLIDES[index];
    stage.innerHTML = `<svg class="intro-art" viewBox="0 0 360 270" aria-hidden="true" fill="none" stroke="#1E2A63" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${art[slide.kind]}</svg><div aria-live="polite" aria-atomic="true"><h1>${slide.title}</h1><p>${slide.text}</p></div>`;
    prev.hidden = index === 0;
    skip.hidden = !replay && index === INTRO_SLIDES.length - 1;
    if (skip.hidden && document.activeElement === skip) next.focus();
    next.textContent =
      index === INTRO_SLIDES.length - 1
        ? replay
          ? "\u0625\u0646\u0647\u0627\u0621 \u0627\u0644\u062C\u0648\u0644\u0629"
          : "\u0627\u0628\u062F\u0623 \u0631\u062D\u0644\u062A\u0643"
        : "\u0627\u0644\u062A\u0627\u0644\u064A";
    dots.replaceChildren();
    INTRO_SLIDES.forEach((_, i) => {
      const dot = document.createElement("button");
      dot.setAttribute(
        "aria-label",
        `\u0627\u0644\u0635\u0641\u062D\u0629 ${i + 1} \u0645\u0646 ${INTRO_SLIDES.length}`,
      );
      dot.setAttribute("aria-current", String(i === index));
      dot.innerHTML = "<i></i>";
      dot.onclick = () => go(i);
      dots.append(dot);
    });
  }
  function go(value) {
    if (!busy) {
      index = Math.max(0, Math.min(INTRO_SLIDES.length - 1, value));
      render();
    }
  }
  next.onclick = () => (index === INTRO_SLIDES.length - 1 ? void finish() : go(index + 1));
  prev.onclick = () => go(index - 1);
  skip.onclick = () => void finish();
  let start = null;
  stage.addEventListener(
    "touchstart",
    (event) => {
      start =
        event.touches.length === 1
          ? { x: event.touches[0].clientX, y: event.touches[0].clientY }
          : null;
    },
    { passive: true },
  );
  stage.addEventListener(
    "touchmove",
    (event) => {
      if (event.touches.length !== 1) start = null;
    },
    { passive: true },
  );
  stage.addEventListener("touchcancel", () => {
    start = null;
  });
  stage.addEventListener(
    "touchend",
    (event) => {
      if (!start || !event.changedTouches.length) return;
      const dx = event.changedTouches[0].clientX - start.x;
      const dy = event.changedTouches[0].clientY - start.y;
      start = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(index + (dx > 0 ? 1 : -1));
    },
    { passive: true },
  );
  host.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      go(index + 1);
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(index - 1);
    }
    if (event.key === "Escape") {
      event.preventDefault();
      void finish();
    }
    if (event.key === "Tab") {
      const controls = Array.from(host.querySelectorAll("button")).filter(
        (button) => !button.hidden && !button.disabled,
      );
      const first = controls[0],
        last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  });
  function back(event) {
    event.preventDefault();
    if (index > 0) go(index - 1);
    else void finish();
  }
  window.addEventListener("tamkeen:intro-back", back);
  render();
  skip.focus();
  return cleanup;
}
function replayStudentIntro() {
  return mountStudentIntro(async () => {}, true);
}
export { INTRO_KEY, INTRO_SLIDES, mountStudentIntro, replayStudentIntro };
