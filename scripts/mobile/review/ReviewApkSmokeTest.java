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
        android.graphics.Bitmap screenshot = automation.takeScreenshot();
        assertNotNull("Screenshot unavailable", screenshot);
        try (java.io.FileOutputStream output = new java.io.FileOutputStream(
                new java.io.File(context.getExternalFilesDir(null), "review-launch.png"))) {
            assertTrue(screenshot.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, output));
        } finally { screenshot.recycle(); }
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
        }
    }
}
