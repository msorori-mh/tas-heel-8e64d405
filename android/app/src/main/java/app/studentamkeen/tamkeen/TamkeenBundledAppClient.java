package app.studentamkeen.tamkeen;

import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import java.io.ByteArrayInputStream;
import java.util.Collections;

/** Same-origin bundled UI; only authenticated API calls go to the existing server. */
public final class TamkeenBundledAppClient extends BridgeWebViewClient {
    public TamkeenBundledAppClient(Bridge bridge) { super(bridge); }

    @Override
    public void onPageFinished(WebView view, String url) {
        super.onPageFinished(view, url);
        Uri page = Uri.parse(url);
        if (!"https".equals(page.getScheme()) || !"studentamkeen.com".equals(page.getHost())) return;
        // Old remote-shell installs may have a website service worker. Unregister
        // only this origin's app workers; never clear content, sessions, or storage.
        view.evaluateJavascript("(async()=>{if(!('serviceWorker' in navigator))return;" +
            "const regs=(await navigator.serviceWorker.getRegistrations()).filter(r=>" +
            "['/','/academy/'].includes(new URL(r.scope).pathname));" +
            "if(!regs.length)return;await Promise.all(regs.map(r=>r.unregister()));" +
            "if(navigator.serviceWorker.controller)location.reload();})().catch(()=>{})", null);
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        Uri url = request.getUrl();
        String path = url.getPath() == null ? "" : url.getPath();
        if ("https".equals(url.getScheme()) && "studentamkeen.com".equals(url.getHost()) && url.getPort() == -1) {
            // Preserve request body, authorization and normal TLS validation.
            if (path.startsWith("/api/") || path.startsWith("/_serverFn/")) return null;
            if (path.equals("/sw.js") || path.equals("/academy-sw.js")) {
                return new WebResourceResponse("text/javascript", "UTF-8", 404, "Not Found",
                    Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
            }
        }
        return super.shouldInterceptRequest(view, request);
    }
}
