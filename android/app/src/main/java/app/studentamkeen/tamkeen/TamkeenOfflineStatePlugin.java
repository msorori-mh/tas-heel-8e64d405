package app.studentamkeen.tamkeen;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

/** Narrow Capacitor bridge to the encrypted transactional offline state store. */
@CapacitorPlugin(name = "TamkeenOfflineState")
public class TamkeenOfflineStatePlugin extends Plugin {

    @PluginMethod
    public void compareAndSwap(PluginCall call) {
        JSObject snapshot = call.getObject("snapshot");
        Long expected = call.getLong("expectedRevision");
        if (snapshot == null || expected == null || expected < 0) {
            call.reject("offline_state_snapshot_invalid");
            return;
        }
        try {
            boolean committed = TamkeenOfflineStateStore.compareAndSwap(getContext(), snapshot, expected);
            JSObject result = new JSObject();
            result.put("committed", committed);
            call.resolve(result);
        } catch (Exception ignored) {
            call.reject("offline_state_write_failed");
        }
    }

    @PluginMethod
    public void read(PluginCall call) {
        try {
            JSONObject state = TamkeenOfflineStateStore.read(getContext());
            JSObject result = new JSObject();
            result.put("snapshot", state == null ? JSONObject.NULL : state);
            call.resolve(result);
        } catch (Exception ignored) {
            call.reject("offline_state_read_failed");
        }
    }

    @PluginMethod
    public void write(PluginCall call) {
        JSObject snapshot = call.getObject("snapshot");
        if (snapshot == null) {
            call.reject("offline_state_snapshot_missing");
            return;
        }
        try {
            TamkeenOfflineStateStore.write(getContext(), snapshot);
            call.resolve();
        } catch (IllegalArgumentException ignored) {
            call.reject("offline_state_snapshot_invalid");
        } catch (Exception ignored) {
            call.reject("offline_state_write_failed");
        }
    }
}
