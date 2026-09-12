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
        // JSON numbers such as 0 arrive as Integer, while PluginCall.getLong
        // accepts only Long. Accept exact JS-safe integers without coercing
        // strings, fractions or booleans into a revision.
        Object rawExpected = call.getData().opt("expectedRevision");
        double numeric = rawExpected instanceof Number ? ((Number) rawExpected).doubleValue() : -1;
        if (snapshot == null || !Double.isFinite(numeric) || numeric < 0 ||
                numeric >= 9007199254740991d || numeric != Math.floor(numeric)) {
            call.reject("offline_state_snapshot_invalid");
            return;
        }
        long expected = ((Number) rawExpected).longValue();
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
