import { test } from "vitest";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { INTRO_SLIDES, mountStudentIntro } from "../../src/lib/onboarding/student-intro";

function setup() {
  const dom = new JSDOM('<body><button id="before">Before</button></body>');
  Object.assign(globalThis, {
    document: dom.window.document,
    window: dom.window,
    HTMLElement: dom.window.HTMLElement,
  });
  dom.window.document.querySelector<HTMLButtonElement>("#before")!.focus();
  return dom;
}
test("four pages advance, go back, finish once and restore focus", async () => {
  const dom = setup();
  let finished = 0;
  mountStudentIntro(async () => {
    finished++;
  });
  assert.equal(document.querySelector("h1")!.textContent, INTRO_SLIDES[0].title);
  const next = document.querySelector<HTMLButtonElement>(".intro-next")!;
  for (let i = 1; i < 4; i++) {
    next.click();
    assert.equal(document.querySelector("h1")!.textContent, INTRO_SLIDES[i].title);
  }
  document.querySelector<HTMLButtonElement>(".intro-prev")!.click();
  assert.equal(document.querySelector("h1")!.textContent, INTRO_SLIDES[2].title);
  next.click();
  next.click();
  next.click();
  await Promise.resolve();
  assert.equal(finished, 1);
  assert.equal(document.querySelector(".tamkeen-intro"), null);
  assert.equal(document.activeElement!.id, "before");
  dom.window.close();
});
test("RTL swipes advance; vertical and multi-touch gestures do not", () => {
  const dom = setup();
  const dispose = mountStudentIntro(async () => {});
  const stage = document.querySelector(".intro-stage")!;
  function touch(type: string, points: { clientX: number; clientY: number }[]) {
    const event = new dom.window.Event(type);
    Object.defineProperty(event, type === "touchend" ? "changedTouches" : "touches", {
      value: points,
    });
    stage.dispatchEvent(event);
  }
  touch("touchstart", [{ clientX: 100, clientY: 100 }]);
  touch("touchend", [{ clientX: 200, clientY: 100 }]);
  assert.equal(document.querySelector("h1")!.textContent, INTRO_SLIDES[1].title);
  touch("touchstart", [{ clientX: 100, clientY: 100 }]);
  touch("touchend", [{ clientX: 170, clientY: 220 }]);
  assert.equal(document.querySelector("h1")!.textContent, INTRO_SLIDES[1].title);
  touch("touchstart", [
    { clientX: 100, clientY: 100 },
    { clientX: 110, clientY: 100 },
  ]);
  touch("touchend", [{ clientX: 220, clientY: 100 }]);
  assert.equal(document.querySelector("h1")!.textContent, INTRO_SLIDES[1].title);
  dispose();
  dom.window.close();
});
test("skip saves completion and replay closes without navigation", async () => {
  const dom = setup();
  let finished = 0;
  mountStudentIntro(async () => {
    finished++;
  });
  document.querySelector<HTMLButtonElement>(".intro-skip")!.click();
  await Promise.resolve();
  assert.equal(finished, 1);
  assert.equal(document.querySelector(".tamkeen-intro"), null);
  mountStudentIntro(async () => {}, true);
  assert.equal(document.querySelector(".intro-skip")!.textContent, "إغلاق");
  document.querySelector<HTMLButtonElement>(".intro-skip")!.click();
  await Promise.resolve();
  assert.equal(document.querySelector(".tamkeen-intro"), null);
  dom.window.close();
});
test("keyboard follows RTL order and traps focus", () => {
  const dom = setup();
  const dispose = mountStudentIntro(async () => {});
  const host = document.querySelector(".tamkeen-intro")!;
  host.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  assert.equal(document.querySelector("h1")!.textContent, INTRO_SLIDES[1].title);
  const next = document.querySelector<HTMLButtonElement>(".intro-next")!;
  next.focus();
  next.dispatchEvent(
    new dom.window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }),
  );
  assert.equal(document.activeElement, document.querySelector(".intro-skip"));
  dispose();
  dom.window.close();
});

test("Android back returns to previous page and cleanup removes listener", () => {
  const dom = setup();
  const dispose = mountStudentIntro(async () => {});
  document.querySelector<HTMLButtonElement>(".intro-next")!.click();
  const back = new dom.window.Event("tamkeen:intro-back", { cancelable: true });
  dom.window.dispatchEvent(back);
  assert.equal(back.defaultPrevented, true);
  assert.equal(document.querySelector("h1")!.textContent, INTRO_SLIDES[0].title);
  dispose();
  const after = new dom.window.Event("tamkeen:intro-back", { cancelable: true });
  dom.window.dispatchEvent(after);
  assert.equal(after.defaultPrevented, false);
  dom.window.close();
});

test("bundled offline tour exactly matches shared source", async () => {
  const { build } = await import("esbuild");
  const { readFile } = await import("node:fs/promises");
  const result = await build({
    entryPoints: ["src/lib/onboarding/student-intro.ts"],
    bundle: true,
    format: "esm",
    target: "es2020",
    write: false,
  });
  const { format, resolveConfig } = await import("prettier");
  const outfile = "mobile/www/student-intro.js";
  const formatted = await format(result.outputFiles[0].text, {
    ...(await resolveConfig(outfile)),
    filepath: outfile,
  });
  assert.equal(await readFile(outfile, "utf8"), formatted);
});

test("four neutral pages put offline second and hide skip only on the last page", () => {
  const dom = setup();
  assert.deepEqual(
    INTRO_SLIDES.map((slide) => slide.kind),
    ["brand", "offline", "practice", "deeper"],
  );
  const dispose = mountStudentIntro(async () => {});
  assert.equal(document.querySelector(".intro-tags, .intro-hint, .intro-top strong"), null);
  const skip = document.querySelector<HTMLButtonElement>(".intro-skip")!;
  assert.equal(skip.textContent, "تخطّي");
  assert.equal(skip.hidden, false);
  for (let i = 0; i < 3; i++) document.querySelector<HTMLButtonElement>(".intro-next")!.click();
  assert.equal(skip.hidden, true);
  assert.notEqual(document.activeElement, skip);
  document.querySelector<HTMLButtonElement>(".intro-prev")!.click();
  assert.equal(skip.hidden, false);
  dispose();
  const replay = mountStudentIntro(async () => {}, true);
  for (let i = 0; i < 3; i++) document.querySelector<HTMLButtonElement>(".intro-next")!.click();
  assert.equal(document.querySelector<HTMLButtonElement>(".intro-skip")!.hidden, false);
  assert.equal(document.querySelector(".intro-next")!.textContent, "إنهاء الجولة");
  replay();
  dom.window.close();
});

test("tour source preserves the completion key and uses embedded assets without region names", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile("src/lib/onboarding/student-intro.ts", "utf8");
  assert.ok(source.includes('"tamkeen.student-intro.v1"'));
  assert.doesNotMatch(source, /صنعاء|عدن|intro-tags|intro-hint|تمكين الطالب/);
  assert.doesNotMatch(source, /<img|https?:\/\//);
});

test("native edge-to-edge fallback does not add padding to older non-overlay shells", () => {
  const dom = setup();
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: dom.window.navigator,
  });
  Object.assign(dom.window, {
    Capacitor: { isNativePlatform: () => true, getPlatform: () => "android" },
  });
  try {
    Object.defineProperty(dom.window.navigator, "userAgent", {
      configurable: true,
      value: "Android 16",
    });
    let dispose = mountStudentIntro(async () => {});
    assert.ok(
      document
        .querySelector<HTMLElement>(".tamkeen-intro")!
        .style.getPropertyValue("--intro-top-padding")
        .includes("32px"),
    );
    dispose();
    document.documentElement.classList.add("native-status-inset-consumed");
    dispose = mountStudentIntro(async () => {});
    assert.equal(
      document
        .querySelector<HTMLElement>(".tamkeen-intro")!
        .style.getPropertyValue("--intro-top-padding"),
      "",
    );
    dispose();
    document.documentElement.classList.remove("native-status-inset-consumed");
    Object.defineProperty(dom.window.navigator, "userAgent", {
      configurable: true,
      value: "Android 14",
    });
    dispose = mountStudentIntro(async () => {});
    assert.equal(
      document
        .querySelector<HTMLElement>(".tamkeen-intro")!
        .style.getPropertyValue("--intro-top-padding"),
      "",
    );
    dispose();
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
    dom.window.close();
  }
});
