package app.studentamkeen.tamkeen;

import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

/** Bundled full UI with the existing same-origin backend. No HTTP/header proxy. */
public final class TamkeenWebViewClient extends BridgeWebViewClient {
    public TamkeenWebViewClient(Bridge bridge) {
        super(bridge);
    }

    static boolean isBackendRequest(Uri url) {
        if (!"https".equals(url.getScheme()) || !"studentamkeen.com".equals(url.getHost()) ||
            (url.getPort() != -1 && url.getPort() != 443) || url.getUserInfo() != null) return false;
        String path = url.getPath();
        return path != null && (path.startsWith("/api/") || path.startsWith("/_serverFn/"));
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        // null delegates the request to WebView's normal HTTPS network stack,
        // retaining TLS, cookies, methods, bodies and browser security headers.
        // Every page, including /academy, still comes from packaged assets.
        if (isBackendRequest(request.getUrl())) return null;
        return super.shouldInterceptRequest(view, request);
    }
}
