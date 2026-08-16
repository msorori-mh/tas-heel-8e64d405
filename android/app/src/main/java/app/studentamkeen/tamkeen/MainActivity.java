package app.studentamkeen.tamkeen;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 18C2 — app-local plugin: native PDF viewer (Arabic-correct rendering).
        registerPlugin(TamkeenPdfViewerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
