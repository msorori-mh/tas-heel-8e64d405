import assert from "node:assert/strict";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";

// Recovery returns to the exact same bundled app, never a second lesson browser.
const recovery = `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>تمكين الطالب</title><body style="background:#fbfaf7;font-family:system-ui;padding:32px;text-align:center"><p role="status">جارٍ فتح تمكين…</p><a href="/">فتح التطبيق</a><script>
try {
  const key = 'tamkeen-shell-recovery-at';
  const previous = Number(sessionStorage.getItem(key) || 0);
  if (Date.now() - previous > 10000) { sessionStorage.setItem(key, String(Date.now())); location.replace('/'); }
  else document.querySelector('[role=status]').textContent = 'تعذّر فتح الواجهة. أعد فتح التطبيق للمحاولة مجددًا. محتواك المحفوظ باقٍ على الجهاز.';
} catch { location.replace('/'); }
</script></body></html>`;

export async function prepareBundledUi(destination) {
  const html = await readFile("dist/client/index.html", "utf8");
  assert.match(html, /<html[^>]+dir="rtl"/);
  assert.match(html, /type="module"/);
  assert.ok(
    !html.includes("دروسك المحفوظة"),
    "Do not ship the legacy offline library as the app entry",
  );
  await writeFile("dist/client/app-recovery.html", recovery);
  // Backward-compatible URLs held by older Android WebView saved state.
  await writeFile("dist/client/review-offline.html", recovery);
  await mkdir(destination, { recursive: true });
  await cp("dist/client", destination, { recursive: true });
}
