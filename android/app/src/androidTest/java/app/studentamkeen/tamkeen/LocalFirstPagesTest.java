package app.studentamkeen.tamkeen;

import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.os.ParcelFileDescriptor;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

/** Runs against a real Android WebView and native plugins with radios disabled. */
@RunWith(AndroidJUnit4.class)
public class LocalFirstPagesTest {
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private MainActivity activity;
    private void shell(String command) throws Exception {
        try (ParcelFileDescriptor descriptor = instrumentation.getUiAutomation().executeShellCommand(command);
             java.io.InputStream stream = new ParcelFileDescriptor.AutoCloseInputStream(descriptor)) {
            byte[] bytes = new byte[1024]; while (stream.read(bytes) >= 0) { }
        }
    }
    private void screenshot(Context context, String name) throws Exception {
        // Shell-owned screenshots survive the runner's target-package cleanup.
        shell("screencap -p /sdcard/" + name + ".png");
    }
    private String js(String expression) throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        instrumentation.runOnMainSync(() -> activity.getBridge().getWebView().evaluateJavascript(expression, value -> {
            result.set(value); latch.countDown();
        }));
        assertTrue("WebView callback", latch.await(10, TimeUnit.SECONDS));
        return result.get();
    }
    private void eventually(String expression) throws Exception {
        long end = System.currentTimeMillis() + 20000;
        while (System.currentTimeMillis() < end) {
            if ("true".equals(js(expression))) return;
            Thread.sleep(100);
        }
        fail("Condition did not become true: " + expression + " body=" + js("document.body.innerText"));
    }
    private void write(Context context, String path, String content) throws Exception {
        File file = new File(context.getFilesDir(), path);
        file.getParentFile().mkdirs();
        try (FileOutputStream stream = new FileOutputStream(file)) { stream.write(content.getBytes(StandardCharsets.UTF_8)); }
    }
    private void fixture(Context context, String owner) throws Exception {
        String body = "<html dir=\"rtl\"><body>TEST_ONLY_IRON</body></html>";
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        StringBuilder hash = new StringBuilder();
        for (byte b : MessageDigest.getInstance("SHA-256").digest(bytes)) hash.append(String.format("%02x", b & 255));
        JSONObject artifact = new JSONObject().put("artifactId", "mind-map:test-only")
            .put("resourceId", "mind-map:test-only").put("kind", "lesson-html")
            .put("lessonId", "test-iron").put("lessonTitle", "الحديد التجريبي")
            .put("title", "خريطة الحديد").put("relativePath", "packs/test-iron.html")
            .put("byteSize", bytes.length).put("sha256", hash.toString());
        JSONObject scope = new JSONObject().put("subjectId", "test-chemistry").put("subjectTitle", "كيمياء تجريبية");
        JSONObject manifest = new JSONObject().put("revision", 1).put("scope", scope).put("artifacts", new JSONArray().put(artifact));
        JSONObject pack = new JSONObject().put("ownerId", "TEST_ONLY_A").put("status", "ready")
            .put("manifest", manifest).put("verifiedArtifactIds", new JSONArray().put("mind-map:test-only"));
        JSONObject mutation = new JSONObject().put("id", "op-test-a").put("ownerId", "TEST_ONLY_A")
            .put("payloadSha256", "test-payload-hash").put("status", "pending")
            .put("nextAttemptAt", "2026-01-01T00:00:00.000Z").put("attempts", 0);
        JSONObject state = new JSONObject().put("schemaVersion", 1).put("activeOwnerId", owner)
            .put("packs", new JSONArray().put(pack)).put("learning", new JSONArray()).put("outbox", new JSONArray().put(mutation));
        write(context, "tamkeen/offline/foundation-v1.json", state.toString());
        write(context, "tamkeen/offline-artifacts/TEST_ONLY_A/packs/test-iron.html", body);
    }
    private void launch(Context context) {
        Intent intent = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        activity = (MainActivity) instrumentation.startActivitySync(intent);
    }
    @Test public void coldLaunchPagesLessonsAndOwnerIsolationWithoutInternet() throws Exception {
        Context context = instrumentation.getTargetContext();
        shell("svc wifi disable"); shell("svc data disable");
        try {
            fixture(context, "TEST_ONLY_A");
            launch(context);
            eventually("document.getElementById('home-view') && !document.getElementById('home-view').hidden");
            assertEquals("\"https://studentamkeen.com/index.html\"", js("location.href"));
            js("window.Capacitor.Plugins.Network.getStatus().then(v=>window.testConnected=v.connected)");
            eventually("window.testConnected === false");
            eventually("document.querySelector('#subjects .lesson-button') !== null");
            assertEquals("true", js("document.querySelector('.brand-mark').complete && document.querySelector('.brand-mark').naturalWidth > 0"));
            screenshot(context, "local-pages-home");
            for (String id : new String[]{"subjects-view", "exams-view", "progress-view", "account-view", "downloads-view", "settings-view"}) {
                js("document.querySelector('[data-go=\"" + id + "\"]').click()");
                assertEquals("false", js("document.getElementById('" + id + "').hidden"));
            }
            screenshot(context, "local-pages-settings");
            js("document.querySelector('#subjects .lesson-button').click()");
            eventually("!document.getElementById('lesson-view').hidden && document.querySelector('#components iframe') !== null");
            assertEquals("true", js("document.querySelector('#components iframe').srcdoc.includes('TEST_ONLY_IRON')"));
            screenshot(context, "local-pages-lesson");
            js("window.dispatchEvent(new Event('online'))");
            assertEquals("false", js("document.getElementById('lesson-view').hidden"));
            js("window.Capacitor.Plugins.TamkeenOfflineContent.getPendingMutations({sessionUserId:'TEST_ONLY_B'}).catch(()=>window.ownerRejected=true)");
            eventually("window.ownerRejected === true");
            js("window.Capacitor.Plugins.TamkeenOfflineContent.acknowledgeMutation({sessionUserId:'TEST_ONLY_A',id:'op-test-a',payloadSha256:'wrong-hash',delivered:true}).catch(()=>window.hashRejected=true)");
            eventually("window.hashRejected === true");
            js("window.Capacitor.Plugins.TamkeenOfflineContent.getPendingMutations({sessionUserId:'TEST_ONLY_A'}).then(v=>window.queueBefore=v)");
            eventually("window.queueBefore && window.queueBefore.records.length === 1");
            js("window.Capacitor.Plugins.TamkeenOfflineContent.acknowledgeMutation({sessionUserId:'TEST_ONLY_A',id:'op-test-a',payloadSha256:'test-payload-hash',delivered:true}).then(()=>window.acked=true)");
            eventually("window.acked === true");
            js("window.Capacitor.Plugins.TamkeenOfflineContent.getPendingMutations({sessionUserId:'TEST_ONLY_A'}).then(v=>window.queueAfter=v)");
            eventually("window.queueAfter && window.queueAfter.pendingCount === 0");
            // Activity recreation is a cold WebView start; native files remain intact.
            instrumentation.runOnMainSync(() -> activity.finish());
            instrumentation.waitForIdleSync();
            launch(context);
            eventually("document.querySelector('#subjects .lesson-button') !== null");
            instrumentation.runOnMainSync(() -> activity.finish());
            instrumentation.waitForIdleSync();
            fixture(context, "TEST_ONLY_B");
            launch(context);
            eventually("document.getElementById('subjects').textContent.includes('لا توجد دروس محفوظة')");
            assertEquals("false", js("document.getElementById('subjects').textContent.includes('الحديد التجريبي')"));
        } finally {
            if (activity != null) instrumentation.runOnMainSync(() -> activity.finish());
            shell("svc wifi enable"); shell("svc data enable");
        }
    }
}
