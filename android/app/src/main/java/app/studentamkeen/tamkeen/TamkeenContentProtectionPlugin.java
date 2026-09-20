package app.studentamkeen.tamkeen;

import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileInputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Narrow artifact bridge: fixed roots, active owner and registered manifest binding. */
@CapacitorPlugin(name = "TamkeenContentProtection")
public final class TamkeenContentProtectionPlugin extends Plugin {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();

    private JSONObject state() throws Exception {
        // Do not use an older owner from a backup after sign-out or an incomplete owner transition.
        File file = new File(getContext().getFilesDir(), "tamkeen/offline/foundation-v1.json");
        if (!file.isFile() || file.length() > 16 * 1024 * 1024) throw new Exception();
        try (FileInputStream input = new FileInputStream(file)) {
            JSONObject state = new JSONObject(new String(input.readAllBytes(), StandardCharsets.UTF_8));
            if (state.optInt("schemaVersion", -1) != 1) throw new Exception();
            return state;
        }
    }

    private ContentEnvelope.Binding binding(PluginCall call, boolean removing) throws Exception {
        String owner = call.getString("ownerId");
        JSONObject state = state();
        if (owner == null || !owner.equals(state.optString("activeOwnerId", ""))) {
            throw new SecurityException("OFFLINE_OWNER_CHANGED");
        }
        JSObject requested = call.getObject("artifact");
        if (requested == null) throw new IllegalArgumentException();
        ContentEnvelope.Binding binding = new ContentEnvelope.Binding(owner,
            requested.getString("artifactId"), requested.getString("relativePath"),
            requested.getString("sha256"), requested.getInt("byteSize"));
        if (removing) return binding;
        JSONArray packs = state.optJSONArray("packs");
        if (packs != null) for (int p = 0; p < packs.length(); p++) {
            JSONObject pack = packs.optJSONObject(p);
            if (pack == null || !owner.equals(pack.optString("ownerId", ""))) continue;
            JSONObject manifest = pack.optJSONObject("manifest");
            JSONArray artifacts = manifest == null ? null : manifest.optJSONArray("artifacts");
            if (artifacts == null) continue;
            for (int i = 0; i < artifacts.length(); i++) {
                JSONObject artifact = artifacts.optJSONObject(i);
                if (artifact != null && binding.artifactId.equals(artifact.optString("artifactId")) &&
                    binding.relativePath.equals(artifact.optString("relativePath")) &&
                    binding.sha256.equals(artifact.optString("sha256")) &&
                    binding.byteSize == artifact.optLong("byteSize", -1)) return binding;
            }
        }
        throw new SecurityException("OFFLINE_PROTECTION_ARTIFACT_UNREGISTERED");
    }

    private void operation(PluginCall call, String mode) {
        worker.execute(() -> {
            try {
                ContentEnvelope.Binding binding = binding(call, mode.equals("remove"));
                ProtectedContentStore store = new ProtectedContentStore(getContext());
                JSObject result = new JSObject();
                if (mode.equals("save")) {
                    String data = call.getString("data");
                    if (data == null || data.length() > ((long) binding.byteSize + 2) / 3 * 4) {
                        throw new IllegalArgumentException();
                    }
                    store.save(binding, Base64.decode(data, Base64.NO_WRAP));
                } else if (mode.equals("remove")) {
                    store.remove(binding);
                } else {
                    byte[] bytes = store.read(binding);
                    result.put("data", bytes == null ? JSONObject.NULL : Base64.encodeToString(bytes, Base64.NO_WRAP));
                }
                // Recheck after I/O so an owner switch does not release another account's bytes.
                if (!binding.ownerId.equals(state().optString("activeOwnerId", ""))) {
                    throw new SecurityException("OFFLINE_OWNER_CHANGED");
                }
                result.put("protection", "android-keystore-aes-gcm-v1");
                call.resolve(result);
            } catch (SecurityException error) {
                call.reject("OFFLINE_OWNER_CHANGED");
            } catch (Exception error) {
                // Never expose keys, file paths, content, or raw provider errors to JavaScript/logs.
                call.reject("OFFLINE_PROTECTION_" + (mode.equals("save") ? "SAVE_FAILED" :
                    mode.equals("remove") ? "REMOVE_FAILED" : "READ_FAILED"));
            }
        });
    }

    @PluginMethod public void saveArtifact(PluginCall call) { operation(call, "save"); }
    @PluginMethod public void readArtifact(PluginCall call) { operation(call, "read"); }
    @PluginMethod public void removeArtifact(PluginCall call) { operation(call, "remove"); }

    @Override protected void handleOnDestroy() { worker.shutdown(); }
}
