package app.studentamkeen.tamkeen;

import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Iterator;
import java.util.Locale;

/**
 * Offline-first foundation for the student Android app.
 *
 * This plugin owns only app-private, non-secret learning state:
 * - curriculum/content snapshots required to render downloaded learning packs;
 * - an idempotent mutation queue for progress, attempts and review state.
 *
 * Authentication credentials, signed URLs and privileged backend values are
 * explicitly rejected before anything reaches SQLite.
 */
@CapacitorPlugin(name = "TamkeenOfflineStore")
public class TamkeenOfflineStorePlugin extends Plugin {
    private static final String DB_NAME = "tamkeen-offline.db";
    private static final int DB_VERSION = 1;
    private static final int MAX_KEY_LENGTH = 240;
    private static final int MAX_KIND_LENGTH = 80;
    private static final int MAX_SCOPE_LENGTH = 360;
    private static final int MAX_VERSION_LENGTH = 120;
    private static final int MAX_ERROR_LENGTH = 600;
    private static final int MAX_PAYLOAD_CHARS = 4 * 1024 * 1024;
    private static final int DEFAULT_LIST_LIMIT = 200;
    private static final int MAX_LIST_LIMIT = 1000;

    private OfflineDbHelper helper;

    @Override
    public void load() {
        helper = new OfflineDbHelper();
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        SQLiteDatabase db = helper.getReadableDatabase();
        JSObject result = new JSObject();
        result.put("schemaVersion", DB_VERSION);
        result.put("contentItems", scalarLong(db, "SELECT COUNT(*) FROM offline_content"));
        result.put("pendingMutations", scalarLong(db, "SELECT COUNT(*) FROM sync_queue WHERE synced_at IS NULL"));
        result.put("syncedMutations", scalarLong(db, "SELECT COUNT(*) FROM sync_queue WHERE synced_at IS NOT NULL"));
        try {
            result.put("databaseBytes", getContext().getDatabasePath(DB_NAME).length());
        } catch (Exception ignored) {
            result.put("databaseBytes", 0L);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void putContent(PluginCall call) {
        JSObject data = call.getData();
        String contentKey = requireString(data, "contentKey", MAX_KEY_LENGTH);
        String kind = requireString(data, "kind", MAX_KIND_LENGTH);
        String scopeKey = requireString(data, "scopeKey", MAX_SCOPE_LENGTH);
        String version = requireString(data, "version", MAX_VERSION_LENGTH);
        String checksum = optionalString(data, "checksum", 160);
        JSONObject payload = data.optJSONObject("payload");
        if (contentKey == null || kind == null || scopeKey == null || version == null || payload == null) {
            call.reject("invalid_offline_content");
            return;
        }
        String payloadJson = payload.toString();
        if (!isPayloadAllowed(payload, payloadJson)) {
            call.reject("offline_payload_rejected");
            return;
        }

        ContentValues values = new ContentValues();
        values.put("content_key", contentKey);
        values.put("kind", kind);
        values.put("scope_key", scopeKey);
        values.put("version", version);
        values.put("checksum", checksum);
        values.put("payload_json", payloadJson);
        values.put("updated_at", System.currentTimeMillis());

        long row = helper.getWritableDatabase().insertWithOnConflict(
            "offline_content",
            null,
            values,
            SQLiteDatabase.CONFLICT_REPLACE
        );
        if (row == -1L) {
            call.reject("offline_content_write_failed");
            return;
        }
        JSObject result = new JSObject();
        result.put("contentKey", contentKey);
        result.put("stored", true);
        call.resolve(result);
    }

    @PluginMethod
    public void getContent(PluginCall call) {
        String contentKey = requireString(call.getData(), "contentKey", MAX_KEY_LENGTH);
        if (contentKey == null) {
            call.reject("invalid_content_key");
            return;
        }
        SQLiteDatabase db = helper.getReadableDatabase();
        try (Cursor cursor = db.query(
            "offline_content",
            null,
            "content_key = ?",
            new String[]{contentKey},
            null,
            null,
            null,
            "1"
        )) {
            if (!cursor.moveToFirst()) {
                JSObject result = new JSObject();
                result.put("item", JSONObject.NULL);
                call.resolve(result);
                return;
            }
            JSObject result = new JSObject();
            result.put("item", contentRow(cursor));
            call.resolve(result);
        } catch (Exception e) {
            call.reject("offline_content_read_failed");
        }
    }

    @PluginMethod
    public void listContent(PluginCall call) {
        JSObject data = call.getData();
        String kind = optionalString(data, "kind", MAX_KIND_LENGTH);
        String scopePrefix = optionalString(data, "scopePrefix", MAX_SCOPE_LENGTH);
        int limit = boundedLimit(data.optInt("limit", DEFAULT_LIST_LIMIT));

        String selection = null;
        String[] args = null;
        if (kind != null && scopePrefix != null) {
            selection = "kind = ? AND scope_key LIKE ?";
            args = new String[]{kind, escapeLike(scopePrefix) + "%"};
        } else if (kind != null) {
            selection = "kind = ?";
            args = new String[]{kind};
        } else if (scopePrefix != null) {
            selection = "scope_key LIKE ?";
            args = new String[]{escapeLike(scopePrefix) + "%"};
        }

        JSArray items = new JSArray();
        try (Cursor cursor = helper.getReadableDatabase().query(
            "offline_content",
            null,
            selection,
            args,
            null,
            null,
            "updated_at DESC, content_key ASC",
            String.valueOf(limit)
        )) {
            while (cursor.moveToNext()) items.put(contentRow(cursor));
            JSObject result = new JSObject();
            result.put("items", items);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("offline_content_list_failed");
        }
    }

    @PluginMethod
    public void deleteContent(PluginCall call) {
        String contentKey = requireString(call.getData(), "contentKey", MAX_KEY_LENGTH);
        if (contentKey == null) {
            call.reject("invalid_content_key");
            return;
        }
        int deleted = helper.getWritableDatabase().delete(
            "offline_content",
            "content_key = ?",
            new String[]{contentKey}
        );
        JSObject result = new JSObject();
        result.put("deleted", deleted > 0);
        call.resolve(result);
    }

    @PluginMethod
    public void enqueueMutation(PluginCall call) {
        JSObject data = call.getData();
        String eventType = requireString(data, "eventType", MAX_KIND_LENGTH);
        String entityId = optionalString(data, "entityId", MAX_KEY_LENGTH);
        String idempotencyKey = requireString(data, "idempotencyKey", MAX_KEY_LENGTH);
        JSONObject payload = data.optJSONObject("payload");
        if (eventType == null || idempotencyKey == null || payload == null) {
            call.reject("invalid_offline_mutation");
            return;
        }
        String payloadJson = payload.toString();
        if (!isPayloadAllowed(payload, payloadJson)) {
            call.reject("offline_payload_rejected");
            return;
        }

        ContentValues values = new ContentValues();
        values.put("event_type", eventType);
        values.put("entity_id", entityId);
        values.put("idempotency_key", idempotencyKey);
        values.put("payload_json", payloadJson);
        values.put("created_at", System.currentTimeMillis());
        values.put("attempts", 0);

        SQLiteDatabase db = helper.getWritableDatabase();
        long row = db.insertWithOnConflict("sync_queue", null, values, SQLiteDatabase.CONFLICT_IGNORE);
        JSObject result = new JSObject();
        result.put("queued", row != -1L);
        result.put("duplicate", row == -1L);
        result.put("idempotencyKey", idempotencyKey);
        call.resolve(result);
    }

    @PluginMethod
    public void listPendingMutations(PluginCall call) {
        int limit = boundedLimit(call.getData().optInt("limit", 100));
        JSArray items = new JSArray();
        try (Cursor cursor = helper.getReadableDatabase().query(
            "sync_queue",
            null,
            "synced_at IS NULL",
            null,
            null,
            null,
            "created_at ASC, id ASC",
            String.valueOf(limit)
        )) {
            while (cursor.moveToNext()) items.put(mutationRow(cursor));
            JSObject result = new JSObject();
            result.put("items", items);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("offline_queue_list_failed");
        }
    }

    @PluginMethod
    public void markMutationSynced(PluginCall call) {
        String idempotencyKey = requireString(call.getData(), "idempotencyKey", MAX_KEY_LENGTH);
        if (idempotencyKey == null) {
            call.reject("invalid_idempotency_key");
            return;
        }
        ContentValues values = new ContentValues();
        values.put("synced_at", System.currentTimeMillis());
        values.putNull("last_error");
        int updated = helper.getWritableDatabase().update(
            "sync_queue",
            values,
            "idempotency_key = ? AND synced_at IS NULL",
            new String[]{idempotencyKey}
        );
        JSObject result = new JSObject();
        result.put("updated", updated > 0);
        call.resolve(result);
    }

    @PluginMethod
    public void markMutationFailed(PluginCall call) {
        JSObject data = call.getData();
        String idempotencyKey = requireString(data, "idempotencyKey", MAX_KEY_LENGTH);
        String error = optionalString(data, "error", MAX_ERROR_LENGTH);
        if (idempotencyKey == null) {
            call.reject("invalid_idempotency_key");
            return;
        }
        SQLiteDatabase db = helper.getWritableDatabase();
        db.execSQL(
            "UPDATE sync_queue SET attempts = attempts + 1, last_error = ? " +
                "WHERE idempotency_key = ? AND synced_at IS NULL",
            new Object[]{error == null ? "sync_failed" : error, idempotencyKey}
        );
        JSObject result = new JSObject();
        result.put("updated", true);
        call.resolve(result);
    }

    private long scalarLong(SQLiteDatabase db, String sql) {
        try (Cursor cursor = db.rawQuery(sql, null)) {
            return cursor.moveToFirst() ? cursor.getLong(0) : 0L;
        }
    }

    private JSObject contentRow(Cursor cursor) throws Exception {
        JSObject item = new JSObject();
        item.put("contentKey", cursor.getString(cursor.getColumnIndexOrThrow("content_key")));
        item.put("kind", cursor.getString(cursor.getColumnIndexOrThrow("kind")));
        item.put("scopeKey", cursor.getString(cursor.getColumnIndexOrThrow("scope_key")));
        item.put("version", cursor.getString(cursor.getColumnIndexOrThrow("version")));
        String checksum = cursor.getString(cursor.getColumnIndexOrThrow("checksum"));
        item.put("checksum", checksum == null ? JSONObject.NULL : checksum);
        item.put("payload", new JSONObject(cursor.getString(cursor.getColumnIndexOrThrow("payload_json"))));
        item.put("updatedAt", cursor.getLong(cursor.getColumnIndexOrThrow("updated_at")));
        return item;
    }

    private JSObject mutationRow(Cursor cursor) throws Exception {
        JSObject item = new JSObject();
        item.put("eventType", cursor.getString(cursor.getColumnIndexOrThrow("event_type")));
        String entityId = cursor.getString(cursor.getColumnIndexOrThrow("entity_id"));
        item.put("entityId", entityId == null ? JSONObject.NULL : entityId);
        item.put("idempotencyKey", cursor.getString(cursor.getColumnIndexOrThrow("idempotency_key")));
        item.put("payload", new JSONObject(cursor.getString(cursor.getColumnIndexOrThrow("payload_json"))));
        item.put("createdAt", cursor.getLong(cursor.getColumnIndexOrThrow("created_at")));
        item.put("attempts", cursor.getInt(cursor.getColumnIndexOrThrow("attempts")));
        String lastError = cursor.getString(cursor.getColumnIndexOrThrow("last_error"));
        item.put("lastError", lastError == null ? JSONObject.NULL : lastError);
        return item;
    }

    private String requireString(JSObject data, String key, int maxLength) {
        String value = optionalString(data, key, maxLength);
        return value == null || value.isEmpty() ? null : value;
    }

    private String optionalString(JSObject data, String key, int maxLength) {
        String value = data.optString(key, null);
        if (value == null) return null;
        value = value.trim();
        if (value.isEmpty()) return null;
        if (value.length() > maxLength) return null;
        return value;
    }

    private int boundedLimit(int value) {
        if (value <= 0) return DEFAULT_LIST_LIMIT;
        return Math.min(value, MAX_LIST_LIMIT);
    }

    private String escapeLike(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    private boolean isPayloadAllowed(JSONObject payload, String serialized) {
        if (serialized.length() > MAX_PAYLOAD_CHARS) return false;
        return !containsForbiddenKey(payload);
    }

    private boolean containsForbiddenKey(Object value) {
        if (value instanceof JSONObject) {
            JSONObject object = (JSONObject) value;
            Iterator<String> keys = object.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                String normalized = key.toLowerCase(Locale.ROOT).replace("-", "_");
                if (normalized.contains("access_token") ||
                    normalized.contains("refresh_token") ||
                    normalized.contains("authorization") ||
                    normalized.contains("password") ||
                    normalized.contains("service_role") ||
                    normalized.contains("signed_url") ||
                    normalized.contains("secret")) {
                    return true;
                }
                if (containsForbiddenKey(object.opt(key))) return true;
            }
        } else if (value instanceof JSONArray) {
            JSONArray array = (JSONArray) value;
            for (int i = 0; i < array.length(); i++) {
                if (containsForbiddenKey(array.opt(i))) return true;
            }
        }
        return false;
    }

    private final class OfflineDbHelper extends SQLiteOpenHelper {
        OfflineDbHelper() {
            super(getContext(), DB_NAME, null, DB_VERSION);
        }

        @Override
        public void onConfigure(SQLiteDatabase db) {
            super.onConfigure(db);
            db.setForeignKeyConstraintsEnabled(true);
        }

        @Override
        public void onCreate(SQLiteDatabase db) {
            db.execSQL(
                "CREATE TABLE offline_content (" +
                    "content_key TEXT PRIMARY KEY NOT NULL," +
                    "kind TEXT NOT NULL," +
                    "scope_key TEXT NOT NULL," +
                    "version TEXT NOT NULL," +
                    "checksum TEXT," +
                    "payload_json TEXT NOT NULL," +
                    "updated_at INTEGER NOT NULL" +
                ")"
            );
            db.execSQL("CREATE INDEX offline_content_kind_scope_idx ON offline_content(kind, scope_key)");
            db.execSQL(
                "CREATE TABLE sync_queue (" +
                    "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                    "event_type TEXT NOT NULL," +
                    "entity_id TEXT," +
                    "idempotency_key TEXT NOT NULL UNIQUE," +
                    "payload_json TEXT NOT NULL," +
                    "created_at INTEGER NOT NULL," +
                    "attempts INTEGER NOT NULL DEFAULT 0," +
                    "last_error TEXT," +
                    "synced_at INTEGER" +
                ")"
            );
            db.execSQL("CREATE INDEX sync_queue_pending_idx ON sync_queue(synced_at, created_at, id)");
        }

        @Override
        public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
            // Future versions must use additive migrations. Never drop student data.
        }
    }
}
