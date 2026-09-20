package app.studentamkeen.tamkeen;

import static org.junit.Assert.*;
import android.content.Context;
import android.content.Intent;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** Actual bundled React routes, native durable storage, and a destroyed offline WebView. */
@RunWith(AndroidJUnit4.class)
public class ReviewOfflineShellTest {
  private String evaluate(ActivityScenario<ReviewActivity> a, String script) throws Exception {
    CountDownLatch latch = new CountDownLatch(1); AtomicReference<String> value = new AtomicReference<>();
    a.onActivity(current -> current.getBridge().getWebView().evaluateJavascript(script, result -> { value.set(result); latch.countDown(); }));
    assertTrue(latch.await(10, TimeUnit.SECONDS)); return value.get();
  }
  private void until(ActivityScenario<ReviewActivity> a, String script, String expected) throws Exception {
    long end = System.currentTimeMillis() + 45000; String result = "";
    while (System.currentTimeMillis() < end) { result = evaluate(a, script); if (result != null && result.contains(expected)) return; Thread.sleep(200); }
    fail("OFFLINE_SHELL expected="+expected+" observed="+result);
  }
  private void link(ActivityScenario<ReviewActivity> a, String href) throws Exception {
    evaluate(a, "document.querySelector('a[href=\""+href+"\"]').click();'opening'");
  }
  private void screenshot(Context context, String name) throws Exception {
    android.graphics.Bitmap image = InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
    assertNotNull(image);
    java.io.File dir = new java.io.File(context.getExternalFilesDir(null), "offline-shell-evidence"); dir.mkdirs();
    try (java.io.FileOutputStream out = new java.io.FileOutputStream(new java.io.File(dir, name+".png"))) { image.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, out); } finally { image.recycle(); }
  }
  @Test public void coldStartHomeSeparateSubjectsLessonAndFriendlyOnlineGate() throws Exception {
    Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    Intent intent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
    android.app.UiAutomation ui = InstrumentationRegistry.getInstrumentation().getUiAutomation();
    String fixture;
    try (java.io.InputStream input = InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("offline-shell-fixture.js")) { fixture = new String(input.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8); }
    try {
      ui.executeShellCommand("svc wifi disable").close(); ui.executeShellCommand("svc data disable").close();
      try (ActivityScenario<ReviewActivity> a = ActivityScenario.launch(intent)) {
        until(a, "typeof window.Capacitor", "object"); until(a, "navigator.onLine", "false");
        evaluate(a, fixture); until(a, "window.__offlineShellSeed", "ready");
      }
      // No JS memory, router state, live server, or valid access token survives this launch.
      try (ActivityScenario<ReviewActivity> a = ActivityScenario.launch(intent)) {
        until(a, "location.pathname", "/app");
        until(a, "document.body.innerText", "مرحباً، طالبة");
        until(a, "document.querySelector('nav[aria-label=\"التنقل السفلي\"]')?.innerText", "موادي");
        assertEquals("false", evaluate(a, "location.pathname.includes('review-offline')"));
        screenshot(context, "home-airplane");
        link(a, "/semesters");
        until(a, "document.body.innerText", "الأحياء"); until(a, "document.body.innerText", "الكيمياء");
        assertEquals("false", evaluate(a, "document.body.innerText.includes('التفاعلات الكيميائية')"));
        screenshot(context, "subjects-airplane");
        evaluate(a, "Array.from(document.querySelectorAll('a')).find(a=>a.getAttribute('href')?.startsWith('/subjects/biology')).click();'opening'");
        until(a, "document.body.innerText", "الخلية الحية");
        assertEquals("false", evaluate(a, "document.body.innerText.includes('التفاعلات الكيميائية')"));
        link(a, "/lessons/lesson-biology");
        until(a, "document.querySelector('article')?.innerText", "الخلية الحية");
        until(a, "Array.from(document.querySelectorAll('iframe')).some(f=>(f.srcdoc||'').includes('محتوى الأحياء المحفوظ'))", "true");
        screenshot(context, "lesson-airplane");
        link(a, "/semesters");
        until(a, "Boolean(Array.from(document.querySelectorAll('a')).find(a=>a.getAttribute('href')?.startsWith('/subjects/chemistry')))", "true");
        evaluate(a, "Array.from(document.querySelectorAll('a')).find(a=>a.getAttribute('href')?.startsWith('/subjects/chemistry')).click();'opening'");
        until(a, "document.body.innerText", "التفاعلات الكيميائية");
        assertEquals("false", evaluate(a, "document.body.innerText.includes('الخلية الحية')"));
        link(a, "/exams"); until(a, "document.body.innerText", "هذه الخدمة تحتاج اتصالًا بالإنترنت");
        until(a, "document.querySelector('nav[aria-label=\"التنقل السفلي\"]')?.innerText", "الرئيسية");
        screenshot(context, "connection-required");
        link(a, "/app"); until(a, "document.body.innerText", "مرحباً، طالبة");
        assertEquals("false", evaluate(a, "navigator.onLine"));
      }
    } finally { ui.executeShellCommand("svc wifi enable").close(); ui.executeShellCommand("svc data enable").close(); }
  }
}
