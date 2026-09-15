package app.studentamkeen.tamkeen;

import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.CapConfig;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.util.Collections;

/** Generated into debug sources only. Keeps the reviewed UI independent of production deploys. */
public final class ReviewActivity extends MainActivity {
    @Override
    protected void load() {
        ConnectivityManager connectivity = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        NetworkCapabilities capabilities = connectivity == null ? null : connectivity.getNetworkCapabilities(connectivity.getActiveNetwork());
        if (capabilities == null || !capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) {
            // Choose the offline entry before creating the bridge. Loading '/' and then
            // replacing it can interrupt native auth initialization in the first document.
            try (java.io.InputStream input = getAssets().open("capacitor.config.json")) {
                JSONObject settings = new JSONObject(new String(input.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8));
                JSONObject server = settings.optJSONObject("server");
                if (server == null) server = new JSONObject();
                server.put("appStartPath", "/review-offline.html");
                settings.put("server", server);
                config = new CapConfig(getAssets(), settings);
            } catch (Exception error) {
                throw new IllegalStateException("Review offline configuration could not be loaded", error);
            }
        }
        super.load();
    }

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        getBridge().setWebViewClient(new BridgeWebViewClient(getBridge()) {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                String path = url.getPath() == null ? "" : url.getPath();
                if ("https".equals(url.getScheme()) && "studentamkeen.com".equals(url.getHost()) && url.getPort() == -1) {
                    // Let WebView send the original request, including body/auth, over normal TLS.
                    if (path.startsWith("/api/") || path.startsWith("/_serverFn/")) return null;
                    // A production worker must never replace the APK's pinned review assets.
                    if (path.equals("/sw.js") || path.equals("/academy-sw.js")) {
                        return new WebResourceResponse("text/javascript", "UTF-8", 404, "Not Found", Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
                    }
                }
                return super.shouldInterceptRequest(view, request);
            }
        });
    }
}
