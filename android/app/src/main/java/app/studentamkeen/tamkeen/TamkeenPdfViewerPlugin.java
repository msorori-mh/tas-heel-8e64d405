package app.studentamkeen.tamkeen;

import android.content.Intent;
import android.app.Activity;
import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

/**
 * 18C2 / 21B4-B — TamkeenPdfViewer.
 *
 * Two entry points, both fail-closed:
 *
 *   open({ localPath })        — legacy online path. Accepts ONLY a path that
 *                                is relative to the app-private files dir.
 *   openTextbook({ textbookId }) — offline path used by the in-APK offline
 *                                entry screen. NO path ever crosses the
 *                                bridge: the id is resolved against the
 *                                trusted app-private registry written by
 *                                تمكين itself.
 *   listSavedTextbooks()       — sanitized list of OFFLINE_READY books.
 *
 * The registry lives at files/tamkeen/registry/textbooks.json and is only
 * writable by this app's own private storage.
 */
@CapacitorPlugin(name = "TamkeenPdfViewer")
public class TamkeenPdfViewerPlugin extends Plugin {

    private static final String REGISTRY_PATH = "tamkeen/registry/textbooks.json";
    private static final long MAX_REGISTRY_BYTES = 2L * 1024 * 1024;

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("available", true);
        call.resolve(ret);
    }

    /* ------------------------------------------------------------------ */
    /* Registry                                                            */
    /* ------------------------------------------------------------------ */

    private JSONArray readRegistryBooks() {
        try {
            File registry = new File(getContext().getFilesDir(), REGISTRY_PATH);
            if (!registry.exists() || !registry.isFile()) return new JSONArray();
            if (registry.length() <= 0 || registry.length() > MAX_REGISTRY_BYTES) return new JSONArray();

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            try (FileInputStream in = new FileInputStream(registry)) {
                byte[] buffer = new byte[8192];
                int read;
                while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
            }
            JSONObject root = new JSONObject(new String(out.toByteArray(), StandardCharsets.UTF_8));
            JSONArray books = root.optJSONArray("books");
            return books == null ? new JSONArray() : books;
        } catch (Exception e) {
            // Malformed registry is treated as "no saved books", never a crash.
            return new JSONArray();
        }
    }

    /** Only app-private, relative, traversal-free paths are ever accepted. */
    private boolean isPrivateRelativePath(String path) {
        if (path == null) return false;
        String value = path.trim();
        if (value.isEmpty()) return false;
        if (value.startsWith("/")) return false;
        if (value.contains("..")) return false;
        if (value.contains("://")) return false;
        return true;
    }

    /** Resolves an entry only if it is offline-ready and physically present. */
    private JSONObject resolveTrustedBook(String textbookId) {
        if (textbookId == null || textbookId.trim().isEmpty()) return null;
        JSONArray books = readRegistryBooks();
        for (int i = 0; i < books.length(); i++) {
            JSONObject book = books.optJSONObject(i);
            if (book == null) continue;
            if (!textbookId.equals(book.optString("textbookId", ""))) continue;
            if (!book.optBoolean("offlineReady", false)) return null;

            String localPath = book.optString("localPath", "");
            if (!isPrivateRelativePath(localPath)) return null;

            File file = new File(getContext().getFilesDir(), localPath);
            String base;
            String candidate;
            try {
                base = getContext().getFilesDir().getCanonicalPath();
                candidate = file.getCanonicalPath();
            } catch (Exception e) {
                return null;
            }
            if (!candidate.startsWith(base + File.separator)) return null;
            if (!file.exists() || !file.isFile() || file.length() <= 0) return null;

            // Metadata sanity: a recorded size must match the file on disk
            // (guards truncated / partial downloads).
            long recordedSize = book.optLong("fileSize", 0L);
            if (recordedSize > 0 && recordedSize != file.length()) return null;

            return book;
        }
        return null;
    }

    @PluginMethod
    public void listSavedTextbooks(PluginCall call) {
        JSONArray books = readRegistryBooks();
        JSArray out = new JSArray();
        for (int i = 0; i < books.length(); i++) {
            JSONObject book = books.optJSONObject(i);
            if (book == null) continue;
            String id = book.optString("textbookId", "");
            JSONObject trusted = resolveTrustedBook(id);
            if (trusted == null) continue;

            // Sanitized projection: no path, no url, no token — display only.
            JSObject item = new JSObject();
            item.put("textbookId", id);
            item.put("title", trusted.optString("title", "كتاب المنهج"));
            item.put("subjectLabel", trusted.optString("subjectLabel", ""));
            item.put("coverageLabel", trusted.optString("coverageLabel", ""));
            item.put("bookType", trusted.optString("bookType", "MAIN_TEXTBOOK"));
            item.put("fileSize", trusted.optLong("fileSize", 0L));
            item.put("downloadedAt", trusted.optLong("downloadedAt", 0L));
            out.put(item);
        }
        JSObject ret = new JSObject();
        ret.put("books", out);
        call.resolve(ret);
    }

    /* ------------------------------------------------------------------ */
    /* Opening                                                             */
    /* ------------------------------------------------------------------ */

    @PluginMethod
    public void openTextbook(PluginCall call) {
        String textbookId = call.getString("textbookId");
        JSONObject book = resolveTrustedBook(textbookId);
        if (book == null) {
            call.reject("textbook_not_available_offline");
            return;
        }
        File file = new File(getContext().getFilesDir(), book.optString("localPath", ""));
        launch(call, file, book.optString("title", ""), call.getInt("initialPage", 1));
    }

    @PluginMethod
    public void open(PluginCall call) {
        String localPath = call.getString("localPath");
        if (!isPrivateRelativePath(localPath)) {
            call.reject("invalid_local_path");
            return;
        }

        File file = new File(getContext().getFilesDir(), localPath);
        try {
            String base = getContext().getFilesDir().getCanonicalPath();
            if (!file.getCanonicalPath().startsWith(base + File.separator)) {
                call.reject("invalid_local_path");
                return;
            }
        } catch (Exception e) {
            call.reject("invalid_local_path");
            return;
        }
        if (!file.exists() || !file.isFile()) {
            call.reject("file_not_found");
            return;
        }

        launch(call, file, call.getString("title", ""), call.getInt("initialPage", 1));
    }

    private void launch(PluginCall call, File file, String title, Integer initialPage) {
        Intent intent = new Intent(getContext(), PdfViewerActivity.class);
        intent.putExtra(PdfViewerActivity.EXTRA_ABSOLUTE_PATH, file.getAbsolutePath());
        intent.putExtra(PdfViewerActivity.EXTRA_TITLE, title == null ? "" : title);
        intent.putExtra(PdfViewerActivity.EXTRA_INITIAL_PAGE, initialPage == null ? 1 : initialPage);
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
