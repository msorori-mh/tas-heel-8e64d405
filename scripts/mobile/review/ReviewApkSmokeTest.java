package app.studentamkeen.tamkeen;

import static org.junit.Assert.*;
import android.content.Context;
import android.content.Intent;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

@RunWith(AndroidJUnit4.class)
public class ReviewApkSmokeTest {
    private String evaluate(ActivityScenario<ReviewActivity> activity, String javascript) throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        activity.onActivity(current -> current.getBridge().getWebView().evaluateJavascript(javascript, value -> { result.set(value); latch.countDown(); }));
        assertTrue("WebView evaluation timed out", latch.await(10, TimeUnit.SECONDS));
        return result.get();
    }
    private String until(ActivityScenario<ReviewActivity> activity, String javascript, String expected) throws Exception {
        long end = System.currentTimeMillis() + 45000;
        String value = "";
        while (System.currentTimeMillis() < end) {
            value = evaluate(activity, javascript);
            if (value != null && value.contains(expected)) return value;
            Thread.sleep(250);
        }
        fail("Expected " + expected + " but got " + value);
        return value;
    }
    private void captureVisibleApp(ActivityScenario<ReviewActivity> activity, Context context) throws Exception {
        android.app.UiAutomation automation = InstrumentationRegistry.getInstrumentation().getUiAutomation();
        long end = System.currentTimeMillis() + 45000;
        String foreground = "";
        while (System.currentTimeMillis() < end) {
            android.view.accessibility.AccessibilityNodeInfo root = automation.getRootInActiveWindow();
            foreground = root == null ? "" : String.valueOf(root.getPackageName());
            if (context.getPackageName().equals(foreground)) break;
            Thread.sleep(250);
        }
        assertEquals("A launcher/system dialog obscures the app", context.getPackageName(), foreground);
        CountDownLatch drawn = new CountDownLatch(1);
        activity.onActivity(current -> current.getBridge().getWebView().postVisualStateCallback(1,
            new WebView.VisualStateCallback() {
                @Override public void onComplete(long requestId) { drawn.countDown(); }
            }));
        assertTrue("WebView did not finish drawing", drawn.await(15, TimeUnit.SECONDS));
        // postVisualStateCallback guarantees the NEXT draw, not that the display
        // compositor has already presented it. Reject blank capture frames.
        android.graphics.Bitmap screenshot = null;
        long captureEnd = System.currentTimeMillis() + 15000;
        while (System.currentTimeMillis() < captureEnd) {
            InstrumentationRegistry.getInstrumentation().waitForIdleSync();
            android.graphics.Bitmap candidate = automation.takeScreenshot();
            if (candidate != null && hasVisibleLoginContent(candidate)) {
                screenshot = candidate;
                break;
            }
            if (candidate != null) candidate.recycle();
            Thread.sleep(100);
        }
        assertNotNull("Login DOM exists but no rendered login frame was captured", screenshot);
        try (java.io.FileOutputStream output = new java.io.FileOutputStream(
                new java.io.File(context.getExternalFilesDir(null), "review-launch.png"))) {
            assertTrue(screenshot.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, output));
        } finally { screenshot.recycle(); }
    }
    private boolean hasVisibleLoginContent(android.graphics.Bitmap bitmap) {
        int sampled = 0, colored = 0;
        // Exclude system bars. The purple login control occupies well over 2%
        // of this region; an empty frame or a status/navigation bar does not.
        for (int y = bitmap.getHeight() / 5; y < bitmap.getHeight() * 17 / 20; y += 4) {
            for (int x = bitmap.getWidth() / 10; x < bitmap.getWidth() * 9 / 10; x += 4) {
                int pixel = bitmap.getPixel(x, y);
                int red = android.graphics.Color.red(pixel), green = android.graphics.Color.green(pixel), blue = android.graphics.Color.blue(pixel);
                if (Math.max(red, Math.max(green, blue)) - Math.min(red, Math.min(green, blue)) > 48) colored++;
                sampled++;
            }
        }
        return colored > sampled * 0.02;
    }
    @Test public void pinnedAppLaunchAndAuthenticatedApiBoundary() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("app.studentamkeen.tamkeen.review", context.getPackageName());
        String descriptor;
        try (java.io.InputStream input = context.getAssets().open("public/review-build.json")) {
            descriptor = new String(input.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        }
        assertTrue(descriptor.contains("7a8c7c7dbfab7ac56b95360ebe035c2a88276074"));
        Intent intent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        assertNotNull(intent);
        try (ActivityScenario<ReviewActivity> activity = ActivityScenario.launch(intent)) {
            until(activity, "document.body.innerText", "تمكين");
            until(activity, "typeof window.Capacitor", "object");
            assertEquals("\"https://studentamkeen.com/\"", evaluate(activity, "location.href"));
            evaluate(activity, "location.href='/auth?mode=login'; 'opening'");
            until(activity, "document.body.innerText", "Google");
            until(activity, "Array.from(document.images).every(image => image.complete && image.naturalWidth > 0)", "true");
            captureVisibleApp(activity, context);
            // This request has no credentials: it must reach the existing API and remain denied.
            evaluate(activity, "window.__reviewApi='pending'; fetch('/api/offline-pack/manifest/00000000-0000-4000-8000-000000000001').then(async r=>{window.__reviewApi=String(r.status)+':'+(await r.text())}).catch(()=>{window.__reviewApi='network-error'}); 'requested'");
            until(activity, "window.__reviewApi", "401");
            String response = evaluate(activity, "window.__reviewApi");
            assertTrue(response.contains("unauthorized"));
            evaluate(activity, "window.__reviewWorker='pending'; fetch('/sw.js').then(r=>{window.__reviewWorker=String(r.status)}); 'requested'");
            until(activity, "window.__reviewWorker", "404");
            // The original native offline entry is packaged and can open without a web deployment.
            evaluate(activity, "location.href='/review-offline.html'; 'opening'");
            until(activity, "document.title", "دون اتصال");
            // Seed only local fixture content, then prove the actual APK cold-start route offline.
            evaluate(activity, "window.__academySeed='pending'; const req=indexedDB.open('tamkeen-academy-offline-v1',1); req.onupgradeneeded=()=>{for(const name of ['packs','files','events','notes']) req.result.createObjectStore(name,{keyPath:['owner','id']}).createIndex('owner','owner');}; req.onsuccess=()=>{const db=req.result;const tx=db.transaction('packs','readwrite');tx.objectStore('packs').put({owner:'review-teacher',id:'review-program',program:{title:'برنامج اختبار الأكاديمية'},lessons:[{lesson_id:'review-lesson',title:'درس محفوظ للاختبار',content:'محتوى الأكاديمية يعمل دون إنترنت',sections:[],completed:false}],omitted:[],savedAt:new Date().toISOString()});tx.oncomplete=()=>{db.close();localStorage.setItem('tamkeen-academy-offline-owner','review-teacher');window.__academySeed='ready';};tx.onerror=()=>{window.__academySeed='error';};}; 'seeded'");
            until(activity, "window.__academySeed", "ready");
            android.app.UiAutomation automation = InstrumentationRegistry.getInstrumentation().getUiAutomation();
            try {
                automation.executeShellCommand("svc wifi disable").close();
                automation.executeShellCommand("svc data disable").close();
                until(activity, "navigator.onLine", "false");
                activity.recreate();
                until(activity, "document.title", "دون اتصال");
                until(activity, "Boolean(document.getElementById('academy-offline-entry') && !document.getElementById('academy-offline-entry').hidden)", "true");
                evaluate(activity, "document.getElementById('academy-offline-entry').click(); 'opening'");
                until(activity, "document.body.innerText", "برنامج اختبار الأكاديمية");
                evaluate(activity, "Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('فتح المحتوى المحفوظ')).click(); 'opening'");
                until(activity, "document.body.innerText", "محتوى الأكاديمية يعمل دون إنترنت");
                assertEquals("false", evaluate(activity, "navigator.onLine"));
            } finally {
                automation.executeShellCommand("svc wifi enable").close();
                automation.executeShellCommand("svc data enable").close();
            }

        }
    }
}
