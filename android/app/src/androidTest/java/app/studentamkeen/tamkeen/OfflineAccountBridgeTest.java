package app.studentamkeen.tamkeen;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

/** Disposable-emulator acceptance: actual bundled JS -> Capacitor -> encrypted SQLite. */
@RunWith(AndroidJUnit4.class)
public class OfflineAccountBridgeTest {
    private static final String OWNER = "TEST_ONLY_bridge_student";
    private static final String AUTH_KEY = "sb-zbdhxyuulyovihjgeqbn-auth-token";

    private String evaluate(ActivityScenario<MainActivity> scenario, String javascript) throws Exception {
        AtomicReference<String> result = new AtomicReference<>();
        CountDownLatch finished = new CountDownLatch(1);
        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(javascript, value -> {
            result.set(value); finished.countDown();
        }));
        assertTrue("WebView response timeout", finished.await(5, TimeUnit.SECONDS));
        return result.get();
    }
    private void awaitHome(ActivityScenario<MainActivity> scenario) throws Exception {
        for (int i = 0; i < 60; i++) {
            if ("true".equals(evaluate(scenario, "document.body.innerText.includes('موادك الدراسية')"))) return;
            Thread.sleep(250);
        }
        fail("Bundled authenticated home did not load after saving the account through the native bridge");
    }
    @Test public void authenticatedUiSavesAccountAndRestoresItAfterActivityRecreation() throws Exception {
        assertEquals("Run only on the dedicated disposable CI emulator", "true",
            InstrumentationRegistry.getArguments().getString("tamkeenDisposableEmulator"));
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        SharedPreferences preferences = target.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
        assertFalse("Never replace an existing session", preferences.contains(AUTH_KEY));
        assertNull("Never replace installed offline data", TamkeenOfflineStateStore.read(target));
        // Fixture only at the Auth boundary. The application must perform the
        // initial native account write itself; no offline state is pre-seeded.
        JSONObject user = new JSONObject().put("id", OWNER).put("aud", "authenticated")
            .put("role", "authenticated").put("app_metadata", new JSONObject())
            .put("user_metadata", new JSONObject()).put("created_at", "2026-09-01T00:00:00.000Z");
        JSONObject session = new JSONObject().put("access_token", "TEST_ONLY_access_token")
            .put("refresh_token", "TEST_ONLY_refresh_token").put("token_type", "bearer")
            .put("expires_in", 86400).put("expires_at", System.currentTimeMillis() / 1000 + 86400)
            .put("user", user);
        assertTrue(preferences.edit().putString(AUTH_KEY, session.toString()).commit());
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            awaitHome(scenario);
            assertEquals(OWNER, TamkeenOfflineStateStore.read(target).getString("activeOwnerId"));
            assertEquals("false", evaluate(scenario, "document.body.innerText.includes('تعذر تجهيز الحساب')"));
            scenario.recreate();
            awaitHome(scenario);
            assertEquals(OWNER, TamkeenOfflineStateStore.read(target).getString("activeOwnerId"));
            evaluate(scenario, "localStorage.removeItem(" + JSONObject.quote(AUTH_KEY) + ")");
        } finally {
            // Exact fixture cleanup only, never broad app-data clearing.
            assertTrue(preferences.edit().remove(AUTH_KEY).commit());
            JSONObject state = TamkeenOfflineStateStore.read(target);
            if (state != null) {
                assertEquals(OWNER, state.getString("activeOwnerId"));
                assertEquals(0, state.getJSONArray("outbox").length());
                assertEquals(0, state.getJSONArray("packs").length());
                assertTrue(target.deleteDatabase("tamkeen-offline.db"));
            }
        }
    }
}
