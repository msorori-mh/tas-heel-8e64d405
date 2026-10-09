package app.studentamkeen.tamkeen;

import android.net.Uri;
import android.net.ConnectivityManager;
import android.content.Context;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import org.json.JSONObject;

/** Serves only APK-owned public assets. API/auth responses are never cached here. */
public final class PackagedShellWebViewClient extends BridgeWebViewClient {
    private final Bridge bridge;
    private final JSONObject assets;
    private final Uri origin;

    private PackagedShellWebViewClient(Bridge bridge, JSONObject manifest) throws Exception {
        super(bridge);
        this.bridge = bridge;
        this.origin = Uri.parse(bridge.getErrorUrl());
        Uri builtOrigin = Uri.parse(manifest.getString("stagingOrigin"));
        if (!sameOrigin(builtOrigin) || manifest.getInt("schema") != 1
                || !bridge.getContext().getPackageName().equals(manifest.getString("androidAppId"))) {
            throw new IllegalStateException("Packaged shell target mismatch");
        }
        this.assets = manifest.getJSONObject("assets");
        if (!assets.has("/index.html")) throw new IllegalStateException("Missing packaged entry");
    }

    public static void installIfPackaged(Bridge bridge) {
        if (!"app.studentamkeen.tamkeen.staging".equals(bridge.getContext().getPackageName())) return;
        // Production builds keep their existing client; only an explicitly built
        // and target-checked native shell enables this path.
        try (InputStream input = bridge.getContext().getAssets().open("public/native-shell-manifest.json")) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) bytes.write(buffer, 0, count);
            JSONObject manifest = new JSONObject(new String(bytes.toByteArray(), StandardCharsets.UTF_8));
            bridge.setWebViewClient(new PackagedShellWebViewClient(bridge, manifest));
            ConnectivityManager network = (ConnectivityManager) bridge.getContext()
                    .getSystemService(Context.CONNECTIVITY_SERVICE);
            if (network != null && network.getActiveNetwork() == null) {
                // Airplane-mode cold start must not wait for the remote URL to time out.
                bridge.getWebView().loadUrl(bridge.getErrorUrl());
            }
        } catch (java.io.FileNotFoundException absent) {
            // Legacy APK with no bundled React shell.
        } catch (Exception error) {
            throw new IllegalStateException("Cannot install packaged application shell", error);
        }
    }

    private boolean sameOrigin(Uri url) {
        return "https".equals(url.getScheme()) && origin.getHost().equals(url.getHost())
                && origin.getPort() == url.getPort();
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        Uri url = request.getUrl();
        String path = url.getPath();
        if (!sameOrigin(url) || !"GET".equals(request.getMethod()) || path == null) {
            return super.shouldInterceptRequest(view, request);
        }
        // Exact build manifest membership, not a filesystem path supplied by JS.
        // Only the configured error document may be served as a main document.
        if (assets.has(path) && (!"/index.html".equals(path) || request.isForMainFrame())) {
            try {
                InputStream stream = bridge.getContext().getAssets().open("public" + path);
                if ("/index.html".equals(path)) {
                    stream = bridge.getLocalServer().getJavaScriptInjectedStream(stream);
                }
                return new WebResourceResponse(mime(path), "UTF-8", 200, "OK",
                        Collections.singletonMap("Cache-Control", "no-store"), stream);
            } catch (Exception unavailable) {
                return missing();
            }
        }
        // Missing packaged chunks must fail locally, never mix remote releases.
        if (path.startsWith("/native-shell/")) return missing();
        return super.shouldInterceptRequest(view, request);
    }

    private static WebResourceResponse missing() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }

    private static String mime(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".js")) return "application/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
        if (path.endsWith(".webp")) return "image/webp";
        if (path.endsWith(".woff2")) return "font/woff2";
        if (path.endsWith(".woff")) return "font/woff";
        return "application/octet-stream";
    }
}
