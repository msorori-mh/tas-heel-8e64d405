package app.studentamkeen.tamkeen;

import android.net.Uri;
import android.content.Intent;
import android.graphics.Bitmap;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.util.Collections;

/** The installed application owns these exact routes, even with a live server origin. */
@CapacitorPlugin(name = "TamkeenLocalPages")
public class TamkeenLocalPagesPlugin extends Plugin {
    private static final String ORIGIN = "https://studentamkeen.com";
    private Intent pendingAuthIntent;
    private boolean routingAuth;

    private boolean isAuthReturn(Intent intent) {
        Uri uri = intent == null ? null : intent.getData();
        if (uri == null || !Intent.ACTION_VIEW.equals(intent.getAction())) return false;
        return ("https".equals(uri.getScheme()) && "studentamkeen.com".equals(uri.getEncodedAuthority()) &&
                "/auth/mobile-callback".equals(uri.getPath())) ||
            ("app.studentamkeen.tamkeen".equals(uri.getScheme()) && "auth".equals(uri.getEncodedAuthority()) &&
                "/callback".equals(uri.getPath()));
    }

    @Override
    public void load() {
        // Plugin.load runs before Bridge.loadWebView: the first request is local too.
        if (isAuthReturn(getActivity().getIntent())) pendingAuthIntent = getActivity().getIntent();
        getBridge().setWebViewClient(new LocalPagesClient(getBridge(), this));
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        // Keep the existing web PKCE handler as the only code-exchange owner.
        if (!isAuthReturn(intent)) return;
        getActivity().runOnUiThread(() -> {
            String url = getBridge().getWebView().getUrl();
            if (url != null && "/index.html".equals(Uri.parse(url).getPath())) {
                pendingAuthIntent = new Intent(intent);
                routingAuth = true;
                getBridge().getWebView().loadUrl(ORIGIN + "/app");
            }
        });
    }

    @PluginMethod
    public void openOnline(PluginCall call) {
        String destination = call.getString("destination", "app");
        String path;
        switch (destination) {
            case "app": path = "/app"; break;
            case "settings": path = "/settings"; break;
            case "auth": path = "/auth"; break;
            case "academy": path = "/academy"; break;
            case "callback": path = "/auth/callback"; break;
            default: call.reject("local_destination_invalid"); return;
        }
        getActivity().runOnUiThread(() -> getBridge().getWebView().loadUrl(ORIGIN + path));
        call.resolve();
    }

    static final class LocalPagesClient extends BridgeWebViewClient {
        private final Bridge bridge;
        private final TamkeenLocalPagesPlugin owner;
        LocalPagesClient(Bridge bridge, TamkeenLocalPagesPlugin owner) { super(bridge); this.bridge = bridge; this.owner = owner; }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            super.onPageStarted(view, url, favicon);
            if (owner.pendingAuthIntent != null && !owner.routingAuth && "/index.html".equals(Uri.parse(url).getPath())) {
                owner.routingAuth = true;
                view.stopLoading();
                view.loadUrl(ORIGIN + "/app");
            }
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            Uri uri = Uri.parse(url);
            if (!"https".equals(uri.getScheme()) || !"studentamkeen.com".equals(uri.getEncodedAuthority()) ||
                "/index.html".equals(uri.getPath())) return;
            if (owner.pendingAuthIntent != null) {
                Intent callback = owner.pendingAuthIntent;
                owner.pendingAuthIntent = null;
                // App retains this event until the hosted handler subscribes after hydration.
                bridge.onNewIntent(callback);
            }
            // The hosted app can update independently. Always retain an exit to installed pages.
            view.evaluateJavascript("(function(){if(document.getElementById('tamkeen-local-home'))return;" +
                "var b=document.createElement('button');b.id='tamkeen-local-home';b.type='button';" +
                "b.textContent='الصفحات المحفوظة';b.setAttribute('dir','rtl');" +
                "b.style.cssText='position:fixed;bottom:calc(82px + env(safe-area-inset-bottom));left:12px;z-index:90;padding:10px 14px;border-radius:24px;border:1px solid #dbe1fa;background:#fff;color:#1e2a63;font:600 13px system-ui;box-shadow:0 2px 8px #0002';" +
                "b.onclick=function(){if(!['/','/app','/settings','/auth','/academy'].includes(location.pathname)&&" +
                "!confirm('هل تريد مغادرة الصفحة والعودة إلى الصفحات المحفوظة؟ احفظ نشاطك أولاً.'))return;" +
                "location.assign('https://studentamkeen.com/index.html');};document.body.appendChild(b);})()", null);
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            String asset = LocalPageRoutes.asset(uri.getScheme(), uri.getEncodedAuthority(), uri.getEncodedPath(), request.getMethod());
            if (asset == null) return super.shouldInterceptRequest(view, request);
            String mime = asset.endsWith(".html") ? "text/html" : asset.endsWith(".js") ? "application/javascript" : "image/png";
            try {
                InputStream stream = bridge.getContext().getAssets().open("public/" + asset);
                // errorPath alone skips this on older WebViews. Only trusted APK HTML is injected.
                if (asset.endsWith(".html")) stream = bridge.getLocalServer().getJavaScriptInjectedStream(stream);
                return new WebResourceResponse(mime, "UTF-8", 200, "OK",
                    Collections.singletonMap("Cache-Control", "no-store"), stream);
            } catch (Exception ignored) {
                // Never substitute a remote page if an installed local asset is missing.
                return new WebResourceResponse("text/plain", "UTF-8", 503, "Unavailable",
                    Collections.singletonMap("Cache-Control", "no-store"), new ByteArrayInputStream(new byte[0]));
            }
        }
    }
}
