package app.studentamkeen.tamkeen;

import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;
import java.util.Arrays;

/** Owner- and manifest-bound access to encrypted content; no arbitrary filesystem paths. */
@CapacitorPlugin(name = "TamkeenOfflineArtifacts")
public class TamkeenOfflineArtifactsPlugin extends Plugin {
    @PluginMethod public void read(PluginCall call) { execute(call, "read"); }
    @PluginMethod public void save(PluginCall call) { execute(call, "save"); }
    @PluginMethod public void remove(PluginCall call) { execute(call, "remove"); }

    private void execute(PluginCall call, String operation) {
        byte[] bytes = null;
        try {
            synchronized (TamkeenOfflineStateStore.LOCK) {
                String owner = call.getString("ownerId");
                JSONObject requested = call.getObject("artifact");
                if (requested == null) throw new IllegalArgumentException("offline_artifact_required");
                if ("remove".equals(operation)) {
                    JSONObject state = TamkeenOfflineStateStore.read(getContext());
                    if (state == null || owner == null || !owner.equals(state.optString("activeOwnerId"))) {
                        throw new IllegalStateException("offline_state_owner_changed");
                    }
                    TamkeenOfflineArtifactStore.remove(getContext(), owner, requested);
                    call.resolve();
                    return;
                }
                JSONObject artifact = TamkeenOfflineArtifactStore.authorizedArtifact(getContext(), owner, requested, false);
                if ("save".equals(operation)) {
                    String data = call.getString("data");
                    if (data == null || data.length() > ((artifact.getLong("byteSize") + 2) / 3) * 4) {
                        throw new IllegalArgumentException("offline_artifact_size_mismatch");
                    }
                    bytes = Base64.decode(data, Base64.NO_WRAP);
                    TamkeenOfflineArtifactStore.save(getContext(), owner, artifact, bytes);
                    call.resolve();
                } else {
                    bytes = TamkeenOfflineArtifactStore.read(getContext(), owner, artifact);
                    JSObject result = new JSObject();
                    result.put("data", bytes == null ? JSONObject.NULL : Base64.encodeToString(bytes, Base64.NO_WRAP));
                    call.resolve(result);
                }
            }
        } catch (Exception error) {
            call.reject("offline_artifact_" + operation + "_failed");
        } finally {
            if (bytes != null) Arrays.fill(bytes, (byte) 0);
        }
    }
}
