// src/lib/onboarding/student-intro.ts
var INTRO_KEY = "tamkeen.student-intro.v1";
var INTRO_SLIDES = [
  {
    title: "\u0645\u0646\u0647\u062C\u0643 \u0628\u064A\u0646 \u064A\u062F\u064A\u0643",
    text: "\u062A\u0639\u0644\u0651\u0645 \u062F\u0631\u0648\u0633\u0643\u060C \u0648\u062A\u062F\u0631\u0651\u0628 \u0639\u0644\u0649 \u0623\u0633\u0626\u0644\u062A\u0647\u0627\u060C \u0648\u0627\u0633\u062A\u0639\u062F \u0644\u0644\u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A \u0627\u0644\u0648\u0632\u0627\u0631\u064A\u0629.",
    tags: [
      "\u062A\u0639\u0644\u0651\u0645",
      "\u062A\u062F\u0631\u0651\u0628",
      "\u0631\u0627\u062C\u0639",
    ],
    kind: "home",
  },
  {
    title:
      "\u0634\u0631\u062D \u0648\u062A\u0637\u0628\u064A\u0642 \u0644\u0643\u0644 \u062F\u0631\u0633",
    text: "\u0627\u0641\u0647\u0645 \u062F\u0631\u0633\u0643 \u0628\u0634\u0631\u062D \u0648\u0627\u0636\u062D\u060C \u0648\u062A\u0639\u0644\u0651\u0645 \u062E\u0637\u0648\u0627\u062A \u062D\u0644 \u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u0643\u062A\u0627\u0628\u060C \u062B\u0645 \u0627\u062E\u062A\u0628\u0631 \u0641\u0647\u0645\u0643 \u0628\u0623\u0633\u0626\u0644\u0629 \u0625\u0636\u0627\u0641\u064A\u0629 \u062A\u062B\u0628\u0651\u062A \u0645\u0627 \u062A\u0639\u0644\u0651\u0645\u062A\u0647.",
    tags: [
      "\u0634\u0631\u062D \u0627\u0644\u062F\u0631\u0633",
      "\u062D\u0644 \u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u0643\u062A\u0627\u0628",
      "\u062A\u062D\u0642\u0651\u0642 \u0645\u0646 \u0641\u0647\u0645\u0643",
    ],
    kind: "lesson",
  },
  {
    title:
      "\u0634\u0627\u0647\u062F \u0627\u0644\u062F\u0631\u0633 \u0641\u064A \u062E\u0631\u064A\u0637\u0629 \u0630\u0647\u0646\u064A\u0629",
    text: "\u0627\u0631\u0628\u0637 \u0627\u0644\u0623\u0641\u0643\u0627\u0631 \u0628\u0628\u0639\u0636\u0647\u0627\u060C \u0648\u0627\u0641\u0647\u0645 \u0627\u0644\u0639\u0644\u0627\u0642\u0627\u062A \u0628\u064A\u0646\u0647\u0627\u060C \u0648\u0631\u0627\u062C\u0639 \u0623\u0647\u0645 \u0646\u0642\u0627\u0637 \u0627\u0644\u062F\u0631\u0633 \u0628\u0646\u0638\u0631\u0629 \u0648\u0627\u062D\u062F\u0629.",
    tags: [
      "\u0623\u0641\u0643\u0627\u0631 \u0645\u062A\u0631\u0627\u0628\u0637\u0629",
      "\u0645\u0631\u0627\u062C\u0639\u0629 \u0623\u0633\u0647\u0644",
    ],
    kind: "map",
  },
  {
    title:
      "\u0627\u062F\u062E\u0644 \u0627\u0644\u0645\u0639\u0645\u0644\u2026 \u0648\u062C\u0631\u0651\u0628 \u0628\u0646\u0641\u0633\u0643",
    text: "\u0645\u0639\u0645\u0644 \u0627\u0641\u062A\u0631\u0627\u0636\u064A \u0628\u064A\u0646 \u064A\u062F\u064A\u0643: \u062A\u0641\u0627\u0639\u0644 \u0645\u0639 \u0627\u0644\u062A\u062C\u0631\u0628\u0629\u060C \u0648\u0627\u0633\u062A\u0643\u0634\u0641 \u062E\u0637\u0648\u0627\u062A\u0647\u0627\u060C \u0648\u0631\u0627\u0642\u0628 \u0646\u062A\u0627\u0626\u062C\u0647\u0627.",
    tags: [
      "\u0627\u0633\u062A\u0643\u0634\u0641",
      "\u062C\u0631\u0651\u0628",
      "\u0644\u0627\u062D\u0638",
    ],
    kind: "lab",
  },
  {
    title:
      "\u062A\u062F\u0631\u0651\u0628 \u0639\u0644\u0649 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A \u0627\u0644\u0648\u0632\u0627\u0631\u064A\u0629",
    text: "\u0639\u0650\u0634 \u062A\u062C\u0631\u0628\u0629 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631\u060C \u062B\u0645 \u0631\u0627\u062C\u0639 \u0625\u062C\u0627\u0628\u0627\u062A\u0643 \u0648\u0627\u0643\u062A\u0634\u0641 \u0645\u0627 \u062A\u062D\u062A\u0627\u062C \u0625\u0644\u0649 \u0645\u0631\u0627\u062C\u0639\u062A\u0647.",
    tags: [
      "\u0646\u0645\u0627\u0630\u062C \u0648\u0632\u0627\u0631\u064A\u0629",
      "\u0645\u0631\u0627\u062C\u0639\u0629 \u0627\u0644\u0625\u062C\u0627\u0628\u0627\u062A",
    ],
    kind: "exam",
  },
  {
    title:
      "\u062A\u0639\u0644\u0651\u0645 \u062D\u062A\u0649 \u062F\u0648\u0646 \u0625\u0646\u062A\u0631\u0646\u062A",
    text: "\u0646\u0632\u0651\u0644 \u062F\u0631\u0648\u0633\u0643 \u0648\u0627\u0644\u0645\u062D\u062A\u0648\u0649 \u0627\u0644\u0645\u062A\u0627\u062D \u0644\u0644\u062A\u0646\u0632\u064A\u0644 \u0648\u0623\u0646\u062A \u0645\u062A\u0635\u0644\u060C \u0648\u0648\u0627\u0635\u0644 \u0627\u0644\u062A\u0639\u0644\u0651\u0645 \u0639\u0646\u062F\u0645\u0627 \u064A\u0646\u0642\u0637\u0639 \u0627\u0644\u0625\u0646\u062A\u0631\u0646\u062A.",
    tags: [
      "\u0646\u0632\u0651\u0644 \u0645\u0633\u0628\u0642\u064B\u0627",
      "\u0627\u0641\u062A\u062D \u0627\u0644\u0645\u062D\u062A\u0648\u0649 \u0627\u0644\u0645\u062D\u0641\u0648\u0638",
    ],
    kind: "offline",
  },
];
var art = {
  home: '<rect x="76" y="30" width="208" height="214" rx="24" fill="white"/><rect x="96" y="52" width="168" height="32" rx="10" fill="#1e2a78"/><path d="M118 114h124M118 135h86"/><rect x="98" y="158" width="70" height="62" rx="12" fill="#cff5ef"/><rect x="192" y="158" width="70" height="62" rx="12" fill="#e5e8ff"/><path d="m119 191 10 10 22-25M211 180h31m-31 14h22"/>',
  lesson:
    '<path d="M180 65c-36-24-84-20-122-6v151c40-14 84-15 122 8 38-23 82-22 122-8V59c-38-14-86-18-122 6Z" fill="white"/><path d="M180 65v153M82 91h69m-69 24h69m-69 24h45m78-48h69m-69 24h69"/><circle cx="245" cy="173" r="30" fill="#cff5ef"/><path d="m230 173 10 11 23-26"/>',
  map: '<path d="M180 133 91 64m89 69 89-69m-89 69-89 69m89-69 89 69" stroke="#06b6d4"/><rect x="125" y="106" width="110" height="54" rx="18" fill="#1e2a78"/><rect x="36" y="37" width="100" height="54" rx="16" fill="white"/><rect x="224" y="37" width="100" height="54" rx="16" fill="white"/><rect x="36" y="175" width="100" height="54" rx="16" fill="white"/><rect x="224" y="175" width="100" height="54" rx="16" fill="white"/><path d="M59 64h53m135 0h53M59 202h53m135 0h53"/>',
  lab: '<rect x="36" y="211" width="288" height="18" rx="8" fill="#1e2a78"/><path d="M73 42v169m0-139h154m-31 0v28"/><path d="M184 99h27v38l43 57c6 10 0 17-12 17h-88c-12 0-18-7-12-17l42-57Z" fill="white"/><path d="m163 166-20 30c-3 6 0 10 8 10h92c8 0 11-4 8-10l-22-30Z" fill="#06b6d4" stroke="none"/><circle cx="187" cy="183" r="5" fill="white" stroke="none"/><circle cx="211" cy="193" r="7" fill="white" stroke="none"/><path d="M274 110h28v86c0 20-28 20-28 0Z" fill="white"/><path d="M276 155h24v39c0 15-24 15-24 0Z" fill="#a5b4fc" stroke="none"/><path d="M158 32h16m-8-8v16M292 54h16m-8-8v16" stroke="#06b6d4"/>',
  exam: '<rect x="83" y="33" width="194" height="211" rx="20" fill="white"/><rect x="131" y="24" width="98" height="27" rx="10" fill="#1e2a78"/><path d="M118 79h124M153 112h89m-89 43h89m-89 43h89"/><circle cx="126" cy="111" r="12" fill="#cff5ef"/><circle cx="126" cy="155" r="12" fill="#cff5ef"/><circle cx="126" cy="198" r="12" fill="#e5e8ff"/><path d="m119 110 5 5 10-11m-15 50 5 5 10-11"/>',
  offline:
    '<rect x="106" y="26" width="148" height="225" rx="24" fill="white"/><path d="M159 44h42"/><circle cx="180" cy="130" r="54" fill="#cff5ef" stroke="none"/><path d="M180 96v63m-23-23 23 23 23-23M151 182h58"/><circle cx="246" cy="196" r="27" fill="#1e2a78"/><path d="m234 196 8 8 17-20" stroke="white"/>',
};
var css = `
.tamkeen-intro{position:fixed;inset:0;z-index:1000;overflow:auto;background:#fbfaf7;color:#172041;font:16px/1.7 system-ui,sans-serif;direction:rtl;padding: max(16px,env(safe-area-inset-top)) 20px max(20px,env(safe-area-inset-bottom));box-sizing:border-box}
.tamkeen-intro *{box-sizing:border-box}.tamkeen-intro .intro-wrap{max-width:480px;margin:auto;min-height:calc(100dvh - 48px);display:flex;flex-direction:column}.tamkeen-intro button{font:inherit;cursor:pointer;min-height:44px;border:0;border-radius:14px}.tamkeen-intro .intro-top{display:flex;align-items:center;justify-content:space-between;gap:16px}.tamkeen-intro .intro-skip{background:transparent;color:#626b86;padding:8px 14px}.tamkeen-intro .intro-stage{flex:1;display:flex;flex-direction:column;justify-content:center;text-align:center;touch-action:pan-y pinch-zoom}.tamkeen-intro .intro-art{width:100%;max-height:34dvh;min-height:150px;border-radius:30px;background:radial-gradient(ellipse,#e6f6f8,#f0f1ff 70%,transparent);margin:18px auto}.tamkeen-intro h1{font-size:clamp(23px,6vw,30px);line-height:1.5;margin:0 0 12px;font-weight:800}.tamkeen-intro p{font-size:17px;color:#58617d;margin:0;line-height:1.9}.tamkeen-intro .intro-tags{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin:20px 0}.tamkeen-intro .intro-tags span{padding:7px 12px;border:1px solid #dce5ec;background:white;border-radius:12px;font-size:13px;color:#1e2a78}.tamkeen-intro .intro-dots{display:flex;justify-content:center;gap:2px;margin:8px 0}.tamkeen-intro .intro-dots button{width:36px;background:transparent;padding:12px}.tamkeen-intro .intro-dots i{display:block;height:8px;width:8px;background:#d5d9e6;border-radius:10px}.tamkeen-intro .intro-dots [aria-current=true] i{background:#1e2a78;width:16px}.tamkeen-intro .intro-actions{display:flex;gap:10px}.tamkeen-intro .intro-next{background:#1e2a78;color:white;flex:1;padding:12px 20px;font-weight:700}.tamkeen-intro .intro-prev{background:#eaeef7;color:#1e2a78;padding:12px 20px}.tamkeen-intro .intro-hint{font-size:12px;text-align:center;margin:8px 0}.tamkeen-intro .intro-warning{font-size:13px;color:#936900;margin:8px 0}.tamkeen-intro button:focus-visible{outline:3px solid #06b6d4;outline-offset:3px}
`;
function mountStudentIntro(onComplete, replay = false) {
  const previousFocus = document.activeElement;
  const previousOverflow = document.body.style.overflow;
  const host = document.createElement("section");
  host.className = "tamkeen-intro";
  host.dir = "rtl";
  host.setAttribute("role", "dialog");
  host.setAttribute("aria-modal", "true");
  host.setAttribute(
    "aria-label",
    "\u062C\u0648\u0644\u0629 \u062A\u0639\u0631\u064A\u0641\u064A\u0629 \u0628\u062A\u0637\u0628\u064A\u0642 \u062A\u0645\u0643\u064A\u0646",
  );
  host.innerHTML = `<style>${css}</style><div class="intro-wrap"><header class="intro-top"><strong>\u062A\u0645\u0643\u064A\u0646 \u0627\u0644\u0637\u0627\u0644\u0628</strong><button class="intro-skip">${replay ? "\u0625\u063A\u0644\u0627\u0642" : "\u062A\u062E\u0637\u064A"}</button></header><div class="intro-stage"></div><nav class="intro-dots" aria-label="\u0635\u0641\u062D\u0627\u062A \u0627\u0644\u062C\u0648\u0644\u0629"></nav><p class="intro-warning" role="status"></p><footer><div class="intro-actions"><button class="intro-prev">\u0627\u0644\u0633\u0627\u0628\u0642</button><button class="intro-next">\u0627\u0644\u062A\u0627\u0644\u064A</button></div><p class="intro-hint">\u0627\u0633\u062D\u0628 \u064A\u0645\u064A\u0646\u064B\u0627 \u0644\u0644\u0645\u062A\u0627\u0628\u0639\u0629 \u0623\u0648 \u0627\u0633\u062A\u062E\u062F\u0645 \u0632\u0631 \u0627\u0644\u062A\u0627\u0644\u064A</p></footer></div>`;
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
    stage.innerHTML = `<svg class="intro-art" viewBox="0 0 360 270" aria-hidden="true" fill="none" stroke="#1e2a78" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${art[slide.kind]}</svg><div aria-live="polite" aria-atomic="true"><h1>${slide.title}</h1><p>${slide.text}</p></div><div class="intro-tags">${slide.tags.map((tag) => `<span>${tag}</span>`).join("")}</div>`;
    prev.hidden = index === 0;
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
