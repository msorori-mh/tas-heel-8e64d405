package app.studentamkeen.tamkeen;

import android.content.Intent;
import android.app.Activity;
import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

/**
 * 18C2 — TamkeenPdfViewer.
 *
 * A deliberately small bridge: JS passes a path that is RELATIVE to the app's
 * private files directory (the same directory the 18C offline cache writes to
 * through Capacitor Filesystem `Directory.Data`). No URL, no token, no bucket
 * name ever crosses this boundary, and the viewer never touches the network.
 */
@CapacitorPlugin(name = "TamkeenPdfViewer")
public class TamkeenPdfViewerPlugin extends Plugin {

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("available", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void open(PluginCall call) {
        String localPath = call.getString("localPath");
        if (localPath == null || localPath.trim().isEmpty()) {
            call.reject("missing_local_path");
            return;
        }
        // Hard guard: only app-private, relative paths are accepted.
        if (localPath.startsWith("/") || localPath.contains("..") || localPath.contains("://")) {
            call.reject("invalid_local_path");
            return;
        }

        File file = new File(getContext().getFilesDir(), localPath);
        if (!file.exists() || !file.isFile()) {
            call.reject("file_not_found");
            return;
        }

        Intent intent = new Intent(getContext(), PdfViewerActivity.class);
        intent.putExtra(PdfViewerActivity.EXTRA_ABSOLUTE_PATH, file.getAbsolutePath());
        intent.putExtra(PdfViewerActivity.EXTRA_TITLE, call.getString("title", ""));
        intent.putExtra(PdfViewerActivity.EXTRA_INITIAL_PAGE, call.getInt("initialPage", 1));
        startActivityForResult(call, intent, "onViewerClosed");
    }

    @ActivityCallback
    private void onViewerClosed(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject ret = new JSObject();
        int lastPage = 1;
        if (result != null && result.getData() != null) {
            lastPage = result.getData().getIntExtra(PdfViewerActivity.EXTRA_LAST_PAGE, 1);
        }
        ret.put("lastPage", Math.max(1, lastPage));
        ret.put("closed", result == null || result.getResultCode() == Activity.RESULT_OK);
        call.resolve(ret);
    }
}
