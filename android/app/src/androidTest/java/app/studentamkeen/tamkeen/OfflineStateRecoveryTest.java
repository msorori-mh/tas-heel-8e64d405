package app.studentamkeen.tamkeen;

import android.content.Context;
import android.content.ContextWrapper;
import android.database.DatabaseErrorHandler;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.Assert.*;

/** All files and databases are isolated from the installed app's real data. */
@RunWith(AndroidJUnit4.class)
public class OfflineStateRecoveryTest {
    private Context context;
    private File primary;
    private File backup;

    @Before public void prepare() {
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File isolated = new File(target.getCacheDir(), "TEST_ONLY_offline_" + System.nanoTime());
        isolated.mkdirs();
        context = new ContextWrapper(target) {
            @Override public File getFilesDir() { return isolated; }
            @Override public File getDatabasePath(String name) { return new File(isolated, name); }
            @Override public SQLiteDatabase openOrCreateDatabase(String name, int mode, SQLiteDatabase.CursorFactory factory) {
                return SQLiteDatabase.openOrCreateDatabase(getDatabasePath(name), factory);
            }
            @Override public SQLiteDatabase openOrCreateDatabase(String name, int mode, SQLiteDatabase.CursorFactory factory, DatabaseErrorHandler handler) {
                return SQLiteDatabase.openOrCreateDatabase(getDatabasePath(name).getPath(), factory, handler);
            }
            @Override public boolean deleteDatabase(String name) {
                return SQLiteDatabase.deleteDatabase(getDatabasePath(name));
            }
        };
        primary = new File(context.getFilesDir(), "tamkeen/offline/foundation-v1.json");
        backup = new File(context.getFilesDir(), "tamkeen/offline/foundation-v1.backup.json");
    }
    @After public void cleanup() {
        context.deleteDatabase("tamkeen-offline.db");
        primary.delete();
        backup.delete();
        primary.getParentFile().delete();
        primary.getParentFile().getParentFile().delete();
        context.getFilesDir().delete();
    }
    private JSONObject snapshot() throws Exception {
        return new JSONObject().put("schemaVersion", 1)
            .put("updatedAt", "2026-09-01T00:00:00.000Z")
            .put("activeOwnerId", "TEST_ONLY_student")
            .put("packs", new JSONArray()).put("outbox", new JSONArray())
            .put("learning", new JSONArray());
    }
    private void write(File path, String value) throws Exception {
        path.getParentFile().mkdirs();
        try (FileOutputStream stream = new FileOutputStream(path)) {
            stream.write(value.getBytes(StandardCharsets.UTF_8));
            stream.getFD().sync();
        }
    }
    private static class CapturingCall extends PluginCall {
        JSObject result;
        String error;
        CapturingCall(JSObject data) { super(null, "TamkeenOfflineState", "TEST_ONLY", "compareAndSwap", data); }
        @Override public void resolve(JSObject data) { result = data; }
        @Override public void reject(String message) { error = message; }
    }
    private CapturingCall invokeBridge(Object revision) throws Exception {
        JSONObject data = new JSONObject().put("snapshot", snapshot()).put("expectedRevision", revision);
        // Round-trip through the same Android JSON parser used by the WebView.
        CapturingCall call = new CapturingCall(new JSObject(data.toString()));
        TamkeenOfflineStatePlugin plugin = new TamkeenOfflineStatePlugin() {
            @Override public Context getContext() { return context; }
        };
        plugin.compareAndSwap(call);
        return call;
    }
    @Test public void bridgeSavesFirstAccountFromJsonIntegerAndRestoresIt() throws Exception {
        CapturingCall originalDecoder = new CapturingCall(new JSObject("{\"expectedRevision\":0}"));
        assertTrue(originalDecoder.getData().opt("expectedRevision") instanceof Integer);
        assertNull("Regression: getLong rejects JSON's ordinary integer zero", originalDecoder.getLong("expectedRevision"));
        CapturingCall first = invokeBridge(0);
        assertNull(first.error);
        assertTrue(first.result.getBoolean("committed"));
        JSONObject persisted = TamkeenOfflineStateStore.read(context);
        assertEquals("TEST_ONLY_student", persisted.getString("activeOwnerId"));
        assertEquals(1L, persisted.getLong("revision"));
        assertTrue(invokeBridge(1).result.getBoolean("committed"));
        assertEquals(2L, TamkeenOfflineStateStore.read(context).getLong("revision"));
        assertFalse("Stale writes must still be rejected", invokeBridge(1).result.getBoolean("committed"));
    }
    @Test public void bridgeRejectsInvalidNumbersWithoutErasingTheAccount() throws Exception {
        assertTrue(invokeBridge(0).result.getBoolean("committed"));
        for (Object value : new Object[] { -1, 0.5, "1", true, JSONObject.NULL, 9007199254740991L }) {
            CapturingCall rejected = invokeBridge(value);
            assertEquals("offline_state_snapshot_invalid", rejected.error);
            assertNull(rejected.result);
            assertEquals(1L, TamkeenOfflineStateStore.read(context).getLong("revision"));
            assertEquals("TEST_ONLY_student", TamkeenOfflineStateStore.read(context).getString("activeOwnerId"));
        }
    }
    @Test public void bridgeAcceptsSafeRevisionsAboveTheIntegerRange() throws Exception {
        assertTrue(invokeBridge(0).result.getBoolean("committed"));
        CapturingCall stale = invokeBridge(2147483648L);
        assertNull(stale.error);
        assertFalse(stale.result.getBoolean("committed"));
    }
    @Test public void migratesLegacyWithoutLearningAndVerifiesEncryptedPersistence() throws Exception {
        JSONObject legacy = snapshot();
        legacy.remove("learning");
        write(primary, legacy.toString());
        JSONObject restored = TamkeenOfflineStateStore.read(context);
        assertEquals("TEST_ONLY_student", restored.getString("activeOwnerId"));
        assertEquals(0, restored.getJSONArray("learning").length());
        assertFalse(primary.exists());
        assertEquals(restored.toString(), TamkeenOfflineStateStore.read(context).toString());
        try (SQLiteDatabase db = context.openOrCreateDatabase("tamkeen-offline.db", 0, null);
             Cursor cursor = db.rawQuery("SELECT encrypted_payload FROM offline_state", null)) {
            assertTrue(cursor.moveToFirst());
            byte[] envelope = cursor.getBlob(0);
            assertEquals('T', envelope[0]);
            assertFalse(new String(envelope, StandardCharsets.UTF_8).contains("TEST_ONLY_student"));
        }
    }
    @Test public void rejectsCorruptLegacyWithoutErasingIt() throws Exception {
        write(primary, "{invalid");
        write(backup, "{also-invalid");
        try {
            TamkeenOfflineStateStore.read(context);
            fail("Corrupt state must not become an empty successful migration");
        } catch (IllegalStateException expected) {
            assertEquals("offline_legacy_state_corrupt", expected.getMessage());
        }
        assertTrue(primary.exists());
        assertTrue(backup.exists());
    }
    @Test public void recoversValidBackupBeforeDeletingCorruptPrimary() throws Exception {
        write(primary, "{invalid");
        write(backup, snapshot().toString());
        assertEquals("TEST_ONLY_student", TamkeenOfflineStateStore.read(context).getString("activeOwnerId"));
        assertFalse(primary.exists());
        assertFalse(backup.exists());
    }
    @Test public void allowsOnlyOneConcurrentWriterForTheSameRevision() throws Exception {
        TamkeenOfflineStateStore.write(context, snapshot());
        final long revision = TamkeenOfflineStateStore.read(context).getLong("revision");
        CountDownLatch start = new CountDownLatch(1);
        AtomicInteger committed = new AtomicInteger();
        AtomicInteger failures = new AtomicInteger();
        Runnable operation = () -> {
            try {
                start.await();
                if (TamkeenOfflineStateStore.compareAndSwap(context, snapshot(), revision)) committed.incrementAndGet();
            } catch (Exception error) { failures.incrementAndGet(); }
        };
        Thread first = new Thread(operation);
        Thread second = new Thread(operation);
        first.start(); second.start(); start.countDown();
        first.join(10000); second.join(10000);
        assertFalse(first.isAlive());
        assertFalse(second.isAlive());
        assertEquals(0, failures.get());
        assertEquals(1, committed.get());
        assertEquals(revision + 1, TamkeenOfflineStateStore.read(context).getLong("revision"));
    }
}
