package app.studentamkeen.tamkeen;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 18C2 — app-local plugin: native PDF viewer (Arabic-correct rendering).
        registerPlugin(TamkeenPdfViewerPlugin.class);
        // OFFLINE-04 — hash-verified lesson content for the bundled cold-start entry.
        registerPlugin(TamkeenOfflineContentPlugin.class);
        super.onCreate(savedInstanceState);

        // MOBILE-READABILITY — allow real two-finger pinch zoom in the installed app.
        // The web content keeps its own responsive layout; these settings only restore
        // native WebView gesture zoom and never expose the old on-screen zoom buttons.
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().getSettings().setSupportZoom(true);
            getBridge().getWebView().getSettings().setBuiltInZoomControls(true);
            getBridge().getWebView().getSettings().setDisplayZoomControls(false);
        }
    }
}
