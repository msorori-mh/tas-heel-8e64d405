package app.studentamkeen.tamkeen;

import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.webkit.WebView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Run seedAndOpen, force-stop the APK, then run restoreAfterProcessDeath separately. */
@RunWith(AndroidJUnit4.class)
public class NativeShellOfflineTest {
    private static final String OWNER = "native-offline-fixture";

    @Test public void seedAndOpen() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        String identity = "{\"version\":1,\"profile\":{\"id\":\"profile-test\",\"user_id\":\"" + OWNER
                + "\",\"full_name\":\"طالب الاختبار\",\"grade_id\":\"grade-12\",\"grade_uuid\":\"grade-12\",\"governorate_id\":\"gov-1\",\"curriculum_track_id\":\"track-1\"}}";
        assertTrue(context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE).edit()
                .putString("tamkeen.student-shell.identity.v1", identity).commit());
        File state = new File(context.getFilesDir(), "tamkeen/offline/foundation-v1.json");
        state.getParentFile().mkdirs();
        try (FileOutputStream out = new FileOutputStream(state)) {
            out.write(("{\"schemaVersion\":1,\"updatedAt\":\"2026-10-09T00:00:00.000Z\",\"activeOwnerId\":\""
                    + OWNER + "\",\"packs\":[],\"outbox\":[],\"learning\":[]}").getBytes(StandardCharsets.UTF_8));
        }
        checkOfflineReactHome("seedAndOpen");
    }

    @Test public void restoreAfterProcessDeath() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue(context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
                .contains("tamkeen.student-shell.identity.v1"));
        checkOfflineReactHome("restoreAfterProcessDeath");
    }

    private void checkOfflineReactHome(String phase) throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Context context = instrumentation.getTargetContext();
        ConnectivityManager network = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        assertNull("The emulator must have no network", network.getActiveNetwork());
        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        assertNotNull(launch);
        MainActivity activity = (MainActivity) instrumentation.startActivitySync(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        String result = "";
        long until = System.currentTimeMillis() + 25000;
        while (System.currentTimeMillis() < until) {
            CountDownLatch ready = new CountDownLatch(1);
            AtomicReference<String> value = new AtomicReference<>("");
            AtomicReference<Boolean> focused = new AtomicReference<>(false);
            instrumentation.runOnMainSync(() -> {
                focused.set(activity.hasWindowFocus());
                activity.getBridge().getWebView().evaluateJavascript(
                    "JSON.stringify({home:document.body.innerText.includes('خطوة واحدة اليوم تصنع الفرق.'),"
                    + "legacy:!!document.getElementById('home-view'),"
                    + "logo:[...document.querySelectorAll('img[src=\"/brand/student-tamkeen-mark.png\"]')].some(i=>i.naturalWidth>0)})",
                    response -> { value.set(response); ready.countDown(); });
            });
            assertTrue(ready.await(5, TimeUnit.SECONDS));
            result = value.get();
            if (focused.get() && result.contains("\\\"home\\\":true") && result.contains("\\\"logo\\\":true")
                    && result.contains("\\\"legacy\\\":false")) {
                // JS completion can precede the compositor's first visible frame.
                // A passing DOM must never produce a blank screenshot as evidence.
                CountDownLatch painted = new CountDownLatch(1);
                instrumentation.runOnMainSync(() -> activity.getBridge().getWebView()
                        .postVisualStateCallback(0, new WebView.VisualStateCallback() {
                            @Override public void onComplete(long id) { painted.countDown(); }
                        }));
                assertTrue("WebView did not submit its visual state", painted.await(5, TimeUnit.SECONDS));
                instrumentation.waitForIdleSync();
                Thread.sleep(150);
                Bitmap screenshot = instrumentation.getUiAutomation().takeScreenshot();
                if (!hasPaintedContent(screenshot)) {
                    screenshot.recycle();
                    Thread.sleep(250);
                    continue;
                }
                File image = new File(context.getExternalFilesDir(null), "offline-" + phase + ".png");
                try (FileOutputStream out = new FileOutputStream(image)) {
                    screenshot.compress(Bitmap.CompressFormat.PNG, 100, out);
                }
                screenshot.recycle();
                return;
            }
            Thread.sleep(250);
        }
        fail("Offline React home did not load: " + result);
    }

    private boolean hasPaintedContent(Bitmap image) {
        if (image == null) return false;
        int bandsWithText = 0;
        // Exclude system bars. Require dark content in several separated bands,
        // so neither an empty surface nor a centered launch logo passes.
        for (int band = 2; band < 8; band++) {
            int darkPixels = 0;
            for (int y = image.getHeight() * band / 10; y < image.getHeight() * (band + 1) / 10; y += 8) {
                for (int x = image.getWidth() / 12; x < image.getWidth() * 11 / 12; x += 8) {
                    int pixel = image.getPixel(x, y);
                    if (Color.red(pixel) < 150 && Color.green(pixel) < 150 && Color.blue(pixel) < 180) darkPixels++;
                }
            }
            if (darkPixels > 15) bandsWithText++;
        }
        return bandsWithText >= 3;
    }
}
