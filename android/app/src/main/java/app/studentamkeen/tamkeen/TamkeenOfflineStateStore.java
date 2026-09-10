package app.studentamkeen.tamkeen;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.SecureRandom;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Transactional, encrypted-at-rest storage for the OFFLINE-01 state snapshot. */
final class TamkeenOfflineStateStore {

    private static final String DATABASE_NAME = "tamkeen-offline.db";
    private static final int DATABASE_VERSION = 1;
    private static final String KEY_ALIAS = "tamkeen.offline.state.v1";
    private static final String LEGACY_PRIMARY = "tamkeen/offline/foundation-v1.json";
    private static final String LEGACY_BACKUP = "tamkeen/offline/foundation-v1.backup.json";
    private static final long MAX_STATE_BYTES = 16L * 1024 * 1024;
    private static final byte[] ENVELOPE_MAGIC = new byte[] { 'T', 'K', 'S', '1' };
    private static final int IV_BYTES = 12;
    static final Object LOCK = new Object();

    private TamkeenOfflineStateStore() {}

    private static final class Helper extends SQLiteOpenHelper {
        Helper(Context context) {
            super(context, DATABASE_NAME, null, DATABASE_VERSION);
            setWriteAheadLoggingEnabled(true);
        }

        @Override
        public void onCreate(SQLiteDatabase database) {
            database.execSQL(
                "CREATE TABLE offline_state (" +
                "singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1)," +
                "encrypted_payload BLOB NOT NULL," +
                "updated_at TEXT NOT NULL)"
            );
        }

        @Override
        public void onUpgrade(SQLiteDatabase database, int oldVersion, int newVersion) {
            throw new IllegalStateException("offline_database_upgrade_missing");
        }
    }

    private static void validate(JSONObject state) {
        if (state == null || state.optInt("schemaVersion", -1) != 1) {
            throw new IllegalArgumentException("offline_state_schema_invalid");
        }
        if (
            state.optJSONArray("packs") == null ||
            state.optJSONArray("outbox") == null ||
            state.optJSONArray("learning") == null
        ) {
            throw new IllegalArgumentException("offline_state_shape_invalid");
        }
    }

    private static SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (!store.containsAlias(KEY_ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES,
                "AndroidKeyStore"
            );
            generator.init(
                new KeyGenParameterSpec.Builder(
                    KEY_ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
                )
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setRandomizedEncryptionRequired(true)
                    .build()
            );
            return generator.generateKey();
        }
        return (SecretKey) store.getKey(KEY_ALIAS, null);
    }

    private static byte[] encrypt(byte[] plaintext) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key(), new SecureRandom());
        byte[] iv = cipher.getIV();
        if (iv == null || iv.length != IV_BYTES) {
            throw new IllegalStateException("offline_state_iv_invalid");
        }
        byte[] ciphertext = cipher.doFinal(plaintext);
        ByteBuffer envelope = ByteBuffer.allocate(ENVELOPE_MAGIC.length + IV_BYTES + ciphertext.length);
        envelope.put(ENVELOPE_MAGIC);
        envelope.put(iv);
        envelope.put(ciphertext);
        return envelope.array();
    }

    private static byte[] decrypt(byte[] envelope) throws Exception {
        if (envelope == null || envelope.length <= ENVELOPE_MAGIC.length + IV_BYTES + 16) {
            throw new IllegalStateException("offline_state_envelope_invalid");
        }
        ByteBuffer input = ByteBuffer.wrap(envelope);
        for (byte expected : ENVELOPE_MAGIC) {
            if (input.get() != expected) throw new IllegalStateException("offline_state_envelope_invalid");
        }
        byte[] iv = new byte[IV_BYTES];
        input.get(iv);
        byte[] ciphertext = new byte[input.remaining()];
        input.get(ciphertext);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, iv));
        return cipher.doFinal(ciphertext);
    }

    private static byte[] readBytes(File file) throws Exception {
        if (!file.exists() || !file.isFile() || file.length() <= 0 || file.length() > MAX_STATE_BYTES) {
            return null;
        }
        ByteArrayOutputStream output = new ByteArrayOutputStream((int) file.length());
        try (FileInputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) {
                if (output.size() + read > MAX_STATE_BYTES) return null;
                output.write(buffer, 0, read);
            }
        }
        return output.toByteArray();
    }

    private static JSONObject readLegacy(Context context) {
        boolean present = false;
        String[] paths = new String[] { LEGACY_PRIMARY, LEGACY_BACKUP };
        for (String path : paths) {
            present |= new File(context.getFilesDir(), path).exists();
            try {
                byte[] bytes = readBytes(new File(context.getFilesDir(), path));
                if (bytes == null) continue;
                JSONObject state = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
                if (!state.has("learning")) state.put("learning", new org.json.JSONArray());
                validate(state);
                return state;
            } catch (Exception ignored) {
                // Try the backup before declaring that no migratable legacy state exists.
            }
        }
        if (present) throw new IllegalStateException("offline_legacy_state_corrupt");
        return null;
    }

    private static void deleteLegacy(Context context) {
        String[] paths = new String[] { LEGACY_PRIMARY, LEGACY_BACKUP };
        for (String path : paths) {
            File file = new File(context.getFilesDir(), path);
            if (file.exists() && !file.delete()) {
                throw new IllegalStateException("offline_legacy_state_delete_failed");
            }
        }
    }

    private static JSONObject readDatabase(Context context) throws Exception {
        Helper helper = new Helper(context);
        try {
            SQLiteDatabase database = helper.getReadableDatabase();
            try (Cursor cursor = database.query(
                "offline_state",
                new String[] { "encrypted_payload" },
                "singleton_id = ?",
                new String[] { "1" },
                null,
                null,
                null
            )) {
                if (!cursor.moveToFirst()) return null;
                byte[] plaintext = decrypt(cursor.getBlob(0));
                if (plaintext.length <= 0 || plaintext.length > MAX_STATE_BYTES) {
                    throw new IllegalStateException("offline_state_size_invalid");
                }
                JSONObject state = new JSONObject(new String(plaintext, StandardCharsets.UTF_8));
                validate(state);
                return state;
            }
        } finally {
            helper.close();
        }
    }

    private static void writeDatabase(Context context, JSONObject state) throws Exception {
        validate(state);
        byte[] plaintext = state.toString().getBytes(StandardCharsets.UTF_8);
        if (plaintext.length <= 0 || plaintext.length > MAX_STATE_BYTES) {
            throw new IllegalStateException("offline_state_size_invalid");
        }
        byte[] encrypted = encrypt(plaintext);
        Helper helper = new Helper(context);
        SQLiteDatabase database = helper.getWritableDatabase();
        database.beginTransaction();
        try {
            ContentValues values = new ContentValues();
            values.put("singleton_id", 1);
            values.put("encrypted_payload", encrypted);
            values.put("updated_at", state.optString("updatedAt", ""));
            long row = database.insertWithOnConflict(
                "offline_state",
                null,
                values,
                SQLiteDatabase.CONFLICT_REPLACE
            );
            if (row == -1L) throw new IllegalStateException("offline_state_write_failed");
            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
            helper.close();
        }
    }

    static JSONObject read(Context context) throws Exception {
        synchronized (LOCK) {
            JSONObject state = readDatabase(context);
            if (state != null) {
                deleteLegacy(context);
                return state;
            }
            JSONObject legacy = readLegacy(context);
            if (legacy == null) return null;
            writeDatabase(context, legacy);
            JSONObject verified = readDatabase(context);
            if (verified == null || !verified.toString().equals(legacy.toString())) {
                throw new IllegalStateException("offline_state_migration_verify_failed");
            }
            deleteLegacy(context);
            return verified;
        }
    }

    static void write(Context context, JSONObject state) throws Exception {
        synchronized (LOCK) {
            JSONObject current = read(context);
            state.put("revision", (current == null ? 0 : current.optLong("revision", 0)) + 1);
            writeDatabase(context, state);
            deleteLegacy(context);
        }
    }

    static boolean compareAndSwap(Context context, JSONObject state, long expectedRevision) throws Exception {
        synchronized (LOCK) {
            JSONObject current = read(context);
            if ((current == null ? 0 : current.optLong("revision", 0)) != expectedRevision) return false;
            state.put("revision", expectedRevision + 1);
            writeDatabase(context, state);
            deleteLegacy(context);
            return true;
        }
    }
}
