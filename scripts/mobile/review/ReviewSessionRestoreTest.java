package app.studentamkeen.tamkeen;

import static org.junit.Assert.*;
import android.content.Context;
import android.content.Intent;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import com.getcapacitor.BridgeWebViewClient;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

/** Instrumentation-only fixtures: no real account, token, or backend mutation. */
@RunWith(AndroidJUnit4.class)
public class ReviewSessionRestoreTest {
    private static final String OWNER = "00000000-0000-4000-8000-000000000091";
    private static final String KEY = "sb-zbdhxyuulyovihjgeqbn-auth-token";
    private static final String SPACE_KEY = "tamkeen.native-last-space.v1";
    private String evaluate(ActivityScenario<ReviewActivity> activity, String script) throws Exception {
        CountDownLatch latch = new CountDownLatch(1); AtomicReference<String> result = new AtomicReference<>();
        activity.onActivity(a -> a.getBridge().getWebView().evaluateJavascript(script, value -> { result.set(value); latch.countDown(); }));
        assertTrue("JS timed out", latch.await(10, TimeUnit.SECONDS)); return result.get();
    }
    private void until(ActivityScenario<ReviewActivity> activity, String script, String expected) throws Exception {
        long end = System.currentTimeMillis() + 45000;
        while (System.currentTimeMillis() < end) {
            String value = evaluate(activity, script); if (value != null && value.contains(expected)) return;
            Thread.sleep(200);
        }
        fail("Session restore did not reach expected non-secret UI state: " + expected);
    }
    private void network(boolean enabled) throws Exception {
        android.app.UiAutomation ui = InstrumentationRegistry.getInstrumentation().getUiAutomation();
        ui.executeShellCommand("svc wifi " + (enabled ? "enable" : "disable")).close();
        ui.executeShellCommand("svc data " + (enabled ? "enable" : "disable")).close();
        android.net.ConnectivityManager connectivity = (android.net.ConnectivityManager) InstrumentationRegistry.getInstrumentation().getTargetContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        long end = System.currentTimeMillis() + 20000;
        while (System.currentTimeMillis() < end) {
            android.net.NetworkCapabilities caps = connectivity.getNetworkCapabilities(connectivity.getActiveNetwork());
            boolean connected = caps != null && caps.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET);
            if (connected == enabled) return;
            Thread.sleep(200);
        }
        fail("Emulator network state did not change");
    }
    private JSONObject user() throws Exception {
        return new JSONObject().put("id", OWNER).put("aud", "authenticated").put("role", "authenticated")
            .put("email", "session-fixture@example.invalid").put("created_at", "2026-01-01T00:00:00Z")
            .put("app_metadata", new JSONObject().put("provider", "google")).put("user_metadata", new JSONObject());
    }
    private JSONObject session(boolean expired, String refresh) throws Exception {
        long exp = System.currentTimeMillis()/1000 + (expired ? -600 : 3600);
        JSONObject payload = new JSONObject().put("sub", OWNER).put("aud", "authenticated").put("role", "authenticated").put("exp", exp);
        String jwt = "eyJhbGciOiJIUzI1NiJ9." + android.util.Base64.encodeToString(payload.toString().getBytes(StandardCharsets.UTF_8), 11) + ".TEST_ONLY_SIGNATURE";
        return new JSONObject().put("access_token", jwt).put("refresh_token", refresh).put("expires_at", exp)
            .put("expires_in", 3600).put("token_type", "bearer").put("user", user());
    }
    private WebResourceResponse json(int status, String body) {
        HashMap<String,String> headers = new HashMap<>();
        headers.put("Access-Control-Allow-Origin", "https://studentamkeen.com");
        headers.put("Access-Control-Allow-Headers", "authorization,apikey,content-type,x-client-info,x-supabase-api-version,accept-profile,content-profile,prefer,x-supabase-client-platform,x-supabase-client-platform-version,x-supabase-client-runtime,x-supabase-client-runtime-version"); headers.put("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
        headers.put("Content-Range", "0-0/1");
        return new WebResourceResponse("application/json", "UTF-8", status, status == 200 ? "OK" : "Unauthorized", headers,
            new ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8)));
    }
    private void installFixture(ActivityScenario<ReviewActivity> activity, AtomicInteger refreshes, AtomicInteger oauth) throws Exception {
        final String fresh = session(false, "TEST_ONLY_ROTATED_REFRESH").toString();
        final String authUser = user().toString();
        final String profile = new JSONObject().put("id", OWNER).put("user_id", OWNER).put("full_name", "اختبار حفظ الجلسة")
            .put("grade_id", 12).put("grade_uuid", OWNER).put("governorate_id", OWNER).put("curriculum_track_id", OWNER)
            .put("primary_subject_id", OWNER).put("school_name", "TEST_ONLY").put("phone", "777000000").put("status", "ACTIVE").toString();
        activity.onActivity(a -> a.getBridge().setWebViewClient(new BridgeWebViewClient(a.getBridge()) {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String host = request.getUrl().getHost(); String path = request.getUrl().getPath();
                if ("zbdhxyuulyovihjgeqbn.supabase.co".equals(host)) {
                    if ("OPTIONS".equals(request.getMethod())) return json(200, "{}");
                    if (path.equals("/auth/v1/token")) { refreshes.incrementAndGet(); return json(200, fresh); }
                    if (path.equals("/auth/v1/user")) return json(200, authUser);
                    if (path.contains("authorize")) { oauth.incrementAndGet(); return json(401, "{}"); }
                    if (path.equals("/rest/v1/profiles") || path.equals("/rest/v1/teacher_profiles")) {
                        String accept = request.getRequestHeaders().get("Accept");
                        if (accept == null) accept = request.getRequestHeaders().get("accept");
                        return json(200, accept != null && accept.contains("vnd.pgrst.object") ? profile : "["+profile+"]");
                    }
                    if (path.contains("has_role") || path.contains("i_have_capability")) return json(200, "false");
                    return json(200, "[]");
                }
                if ("studentamkeen.com".equals(host) && (path.startsWith("/api/") || path.startsWith("/_serverFn/"))) return json(401, "{}");
                if (!"studentamkeen.com".equals(host)) return json(401, "{}");
                return super.shouldInterceptRequest(view, request);
            }
        }));
    }
    @Test public void durableStudentTeacherRefreshAndSignedOutLaunch() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        Intent intent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        assertNotNull(intent);
        AtomicInteger refreshes = new AtomicInteger(), oauth = new AtomicInteger();
        try {
            for (String space : new String[]{"student", "teacher"}) {
                network(false);
                // Seed through the real Capacitor Preferences bridge, then destroy this WebView.
                try (ActivityScenario<ReviewActivity> activity = ActivityScenario.launch(intent)) {
                    until(activity, "typeof window.Capacitor", "object");
                    String record = session(space.equals("teacher"), "TEST_ONLY_INITIAL_REFRESH").toString();
                    String preference = new JSONObject().put("owner", OWNER).put("space", space).toString();
                    String script = "window.__seed=false;Promise.all([Capacitor.nativePromise('Preferences','set',{key:"+JSONObject.quote(KEY)+",value:"+JSONObject.quote(record)+"}),Capacitor.nativePromise('Preferences','set',{key:"+JSONObject.quote(SPACE_KEY)+",value:"+JSONObject.quote(preference)+"})]).then(()=>{localStorage.clear();window.__seed=true});'pending'";
                    evaluate(activity, script); until(activity, "window.__seed", "true");
                }
                try (ActivityScenario<ReviewActivity> activity = ActivityScenario.launch(intent)) {
                    until(activity, "typeof window.Capacitor", "object");
                    assertNotNull("Native preferences were lost", context.getSharedPreferences("CapacitorStorage", 0).getString(KEY, null));
                    installFixture(activity, refreshes, oauth);
                    network(true); until(activity, "navigator.onLine", "true");
                    evaluate(activity, "location.href='/';'opening'");
                    try {
                        until(activity, "location.pathname", space.equals("teacher") ? "/academy" : "/app");
                    } catch (AssertionError failure) {
                        // Fixture-only diagnostics: never print session contents or credentials.
                        throw new AssertionError("RESTORE_FIXTURE space="+space+" refreshRequests="+refreshes.get()+" oauthRequests="+oauth.get()+" UI="+evaluate(activity,"JSON.stringify({path:location.pathname,text:document.body.innerText.slice(0,350)})"), failure);
                    }
                    until(activity, "document.body.innerText", space.equals("teacher") ? "البرامج المناسبة" : "مرحباً، اختبار");
                    assertEquals("0", evaluate(activity, "Array.from(document.querySelectorAll('button')).filter(b=>b.textContent.includes('المتابعة باستخدام Google')).length"));
                    assertNotNull(context.getSharedPreferences("CapacitorStorage", 0).getString(KEY, null));
                    if (space.equals("teacher")) {
                        assertTrue("Expired token was not refreshed", refreshes.get() > 0);
                        JSONObject stored = new JSONObject(context.getSharedPreferences("CapacitorStorage",0).getString(KEY,"{}"));
                        assertTrue("Refreshed session was not durably stored", stored.optString("refresh_token").equals("TEST_ONLY_ROTATED_REFRESH"));
                        evaluate(activity, "Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('تسجيل الخروج')).click();'signout'");
                        until(activity, "document.body.innerText", "Google");
                    }
                }
            }
            assertEquals("A restored session initiated OAuth", 0, oauth.get());
            // Real sign-out above must clear native storage and remain signed out on relaunch.
            assertNull("Native session survived explicit logout", context.getSharedPreferences("CapacitorStorage",0).getString(KEY,null));
            network(false);
            try (ActivityScenario<ReviewActivity> activity = ActivityScenario.launch(intent)) {
                until(activity, "typeof window.Capacitor", "object"); installFixture(activity, refreshes, oauth);
                network(true); until(activity,"navigator.onLine","true"); evaluate(activity,"location.href='/';'opening'");
                until(activity,"document.body.innerText","دخول الطالب"); assertEquals("\"/\"",evaluate(activity,"location.pathname"));
            }
        } finally {
            context.getSharedPreferences("CapacitorStorage",0).edit().remove(KEY).remove(SPACE_KEY).commit();
            network(true);
        }
    }
}
