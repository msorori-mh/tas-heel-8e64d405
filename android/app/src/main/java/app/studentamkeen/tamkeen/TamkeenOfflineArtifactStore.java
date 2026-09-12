package app.studentamkeen.tamkeen;

import android.content.Context;
import android.os.ParcelFileDescriptor;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Locale;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Content-addressed, authenticated private files. Never replaces unreadable state with plaintext. */
final class TamkeenOfflineArtifactStore {
    static final String ROOT = "tamkeen/offline-artifacts-v2";
    private static final String LEGACY_ROOT = "tamkeen/offline-artifacts";
    private static final String KEY_ALIAS = "tamkeen.offline.artifacts.v2";
    private static final int MAX_BYTES = 100 * 1024 * 1024;
    private static final byte[] MAGIC = { 'T', 'K', 'A', '2' };
    // Also serializes owner changes, native journal writes and migration cleanup.
    private static final Object LOCK = TamkeenOfflineStateStore.LOCK;

    private TamkeenOfflineArtifactStore() {}

    private static void validate(String owner, JSONObject artifact) {
        String path = artifact.optString("relativePath");
        long size = artifact.optLong("byteSize", -1);
        if (owner == null || !owner.matches("[a-zA-Z0-9_-]{1,160}") ||
            !artifact.optString("sha256").matches("[a-f0-9]{64}") ||
            size <= 0 || size > MAX_BYTES || path.isEmpty() || path.length() > 240 ||
            path.startsWith("/") || path.contains("\\") || path.contains("\u0000") ||
            path.contains(":") || Arrays.asList(path.split("/", -1)).contains("..")) {
            throw new IllegalArgumentException("offline_artifact_identity_invalid");
        }
    }

    private static File confined(Context context, String relative) throws Exception {
        File base = context.getFilesDir().getCanonicalFile();
        File file = new File(base, relative);
        if (!file.getCanonicalPath().startsWith(base.getPath() + File.separator) ||
            !file.getCanonicalPath().equals(file.getAbsolutePath())) {
            throw new IllegalArgumentException("offline_artifact_path_invalid");
        }
        return file;
    }

    static File encryptedFile(Context context, String owner, JSONObject artifact) throws Exception {
        validate(owner, artifact);
        return confined(context, ROOT + "/" + owner + "/" + artifact.getString("sha256") + "/" + artifact.getString("relativePath"));
    }

    private static SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(KEY_ALIAS)) return (SecretKey) store.getKey(KEY_ALIAS, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true).build());
        return generator.generateKey();
    }

    private static byte[] aad(String owner, JSONObject artifact) throws Exception {
        return new JSONArray().put(owner).put(artifact.getString("sha256"))
            .put(artifact.getString("relativePath")).put(artifact.getLong("byteSize"))
            .toString().getBytes(StandardCharsets.UTF_8);
    }

    private static void verify(byte[] bytes, JSONObject artifact) throws Exception {
        if (bytes.length != artifact.getLong("byteSize")) throw new IOException("offline_artifact_size_mismatch");
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
        StringBuilder hex = new StringBuilder(64);
        for (byte value : digest) hex.append(String.format(Locale.ROOT, "%02x", value & 0xff));
        if (!hex.toString().equals(artifact.getString("sha256"))) throw new IOException("offline_artifact_hash_mismatch");
    }

    private static byte[] readExact(FileInputStream input, int size) throws Exception {
        if (input.getChannel().size() != size) throw new IOException("offline_artifact_size_mismatch");
        byte[] bytes = new byte[size];
        int offset = 0;
        while (offset < size) {
            int count = input.read(bytes, offset, size - offset);
            if (count < 0) throw new IOException("offline_artifact_truncated");
            offset += count;
        }
        if (input.read() != -1) throw new IOException("offline_artifact_size_mismatch");
        return bytes;
    }

    private static byte[] readEncrypted(Context context, String owner, JSONObject artifact) throws Exception {
        AtomicFile file = new AtomicFile(encryptedFile(context, owner, artifact));
        byte[] envelope;
        try (FileInputStream input = file.openRead()) {
            envelope = readExact(input, artifact.getInt("byteSize") + 32);
        }
        if (!Arrays.equals(MAGIC, Arrays.copyOfRange(envelope, 0, 4))) throw new IOException("offline_artifact_envelope_invalid");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, envelope, 4, 12));
        cipher.updateAAD(aad(owner, artifact));
        byte[] bytes = cipher.doFinal(envelope, 16, envelope.length - 16);
        verify(bytes, artifact);
        return bytes;
    }

    private static File[] legacyFiles(Context context, String owner, JSONObject artifact) throws Exception {
        return new File[] {
            confined(context, LEGACY_ROOT + "/" + owner + "/" + artifact.getString("sha256") + "/" + artifact.getString("relativePath")),
            confined(context, LEGACY_ROOT + "/" + owner + "/" + artifact.getString("relativePath"))
        };
    }

    private static void cleanupVerifiedLegacy(Context context, String owner, JSONObject artifact) throws Exception {
        for (File file : legacyFiles(context, owner, artifact)) {
            if (!file.exists()) continue;
            try (FileInputStream input = new FileInputStream(file)) {
                // A previous revision can share the legacy path. Never erase that revision.
                verify(readExact(input, artifact.getInt("byteSize")), artifact);
            } catch (IOException mismatch) { continue; }
            if (!file.delete()) throw new IOException("offline_artifact_legacy_delete_failed");
        }
    }

    private static File legacyPdf(Context context, JSONObject artifact) throws Exception {
        String kind = artifact.optString("kind");
        String id = artifact.optString("resourceId");
        if (!("textbook-pdf".equals(kind) || "lesson-pdf".equals(kind)) ||
            !id.matches("[a-zA-Z0-9_-]{1,160}")) return null;
        return confined(context, "tamkeen/pdf/" + id + ".bin");
    }

    private static void cleanupSharedPdf(Context context, JSONObject artifact) throws Exception {
        File file = legacyPdf(context, artifact);
        if (file == null || !file.exists()) return;
        try (FileInputStream input = new FileInputStream(file)) {
            verify(readExact(input, artifact.getInt("byteSize")), artifact);
        } catch (IOException mismatch) { return; }
        JSONObject state = TamkeenOfflineStateStore.read(context);
        if (state == null) return;
        // The historical PDF cache was shared. Keep it until every referencing
        // account/revision has its own verified encrypted copy.
        for (String field : new String[] { "packs", "packBackups" }) {
            JSONArray records = state.optJSONArray(field);
            if (records == null) continue;
            for (int i = 0; i < records.length(); i++) {
                JSONObject record = records.getJSONObject(i);
                JSONArray artifacts = record.getJSONObject("manifest").getJSONArray("artifacts");
                for (int j = 0; j < artifacts.length(); j++) {
                    JSONObject other = artifacts.getJSONObject(j);
                    if (artifact.optString("resourceId").equals(other.optString("resourceId")) &&
                        artifact.getString("sha256").equals(other.optString("sha256"))) {
                        try {
                            byte[] verified = readEncrypted(context, record.getString("ownerId"), other);
                            Arrays.fill(verified, (byte) 0);
                        } catch (Exception unavailable) { return; }
                    }
                }
            }
        }
        if (!file.delete()) throw new IOException("offline_pdf_legacy_delete_failed");
    }

    static void save(Context context, String owner, JSONObject artifact, byte[] bytes) throws Exception {
        synchronized (LOCK) {
            validate(owner, artifact);
            verify(bytes, artifact);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key());
            cipher.updateAAD(aad(owner, artifact));
            if (cipher.getIV().length != 12) throw new IOException("offline_artifact_iv_invalid");
            AtomicFile file = new AtomicFile(encryptedFile(context, owner, artifact));
            FileOutputStream output = null;
            try {
                output = file.startWrite();
                output.write(MAGIC);
                output.write(cipher.getIV());
                output.write(cipher.doFinal(bytes));
                output.getFD().sync();
                file.finishWrite(output);
            } catch (Exception error) {
                file.failWrite(output);
                throw error;
            }
            // Read-back succeeds before any verified plaintext is removed.
            byte[] verified = readEncrypted(context, owner, artifact);
            Arrays.fill(verified, (byte) 0);
            cleanupVerifiedLegacy(context, owner, artifact);
            cleanupSharedPdf(context, artifact);
        }
    }

    static byte[] read(Context context, String owner, JSONObject artifact) throws Exception {
        synchronized (LOCK) {
            File encrypted = encryptedFile(context, owner, artifact);
            if (encrypted.exists() || new File(encrypted.getPath() + ".bak").exists()) {
                // Authentication failures MUST NOT fall back to an older plaintext file.
                byte[] bytes = readEncrypted(context, owner, artifact);
                cleanupVerifiedLegacy(context, owner, artifact);
                cleanupSharedPdf(context, artifact);
                return bytes;
            }
            java.util.List<File> candidates = new java.util.ArrayList<>(Arrays.asList(legacyFiles(context, owner, artifact)));
            File pdf = legacyPdf(context, artifact);
            if (pdf != null) candidates.add(pdf);
            for (File legacy : candidates) {
                if (!legacy.exists()) continue;
                byte[] bytes;
                try (FileInputStream input = new FileInputStream(legacy)) {
                    bytes = readExact(input, artifact.getInt("byteSize"));
                    verify(bytes, artifact);
                } catch (IOException mismatch) { continue; }
                save(context, owner, artifact, bytes);
                return bytes;
            }
            return null;
        }
    }

    static void remove(Context context, String owner, JSONObject artifact) throws Exception {
        synchronized (LOCK) {
            AtomicFile file = new AtomicFile(encryptedFile(context, owner, artifact));
            file.delete();
            if (file.getBaseFile().exists()) throw new IOException("offline_artifact_delete_failed");
            cleanupVerifiedLegacy(context, owner, artifact);
            cleanupSharedPdf(context, artifact);
        }
    }

    /** Resolve bridge input against trusted manifests and the active account. */
    static JSONObject authorizedArtifact(Context context, String owner, JSONObject requested, boolean readyOnly) throws Exception {
        validate(owner, requested);
        JSONObject state = TamkeenOfflineStateStore.read(context);
        if (state == null || !owner.equals(state.optString("activeOwnerId"))) throw new IOException("offline_state_owner_changed");
        for (String field : new String[] { "packs", "packBackups" }) {
            JSONArray records = state.optJSONArray(field);
            if (records == null) continue;
            for (int i = 0; i < records.length(); i++) {
                JSONObject record = records.optJSONObject(i);
                if (record == null || !owner.equals(record.optString("ownerId")) ||
                    (readyOnly && !"ready".equals(record.optString("status")))) continue;
                if (readyOnly) {
                    JSONArray verified = record.optJSONArray("verifiedArtifactIds");
                    boolean found = false;
                    if (verified != null) for (int j = 0; j < verified.length(); j++) {
                        if (requested.optString("artifactId").equals(verified.optString(j))) found = true;
                    }
                    if (!found) continue;
                }
                JSONArray artifacts = record.getJSONObject("manifest").getJSONArray("artifacts");
                for (int j = 0; j < artifacts.length(); j++) {
                    JSONObject artifact = artifacts.getJSONObject(j);
                    if (requested.optString("artifactId").equals(artifact.optString("artifactId")) &&
                        Arrays.equals(aad(owner, requested), aad(owner, artifact))) return artifact;
                }
            }
        }
        throw new IOException("offline_artifact_not_registered");
    }

    /** PdfRenderer needs a seekable descriptor. Unlink BEFORE writing any plaintext. */
    static ParcelFileDescriptor pdfDescriptor(Context context, String owner, JSONObject requested) throws Exception {
        synchronized (LOCK) {
            JSONObject artifact = authorizedArtifact(context, owner, requested, true);
            if (!"application/pdf".equals(artifact.optString("contentType"))) throw new IOException("offline_artifact_not_pdf");
            byte[] bytes = read(context, owner, artifact);
            if (bytes == null) throw new IOException("offline_artifact_missing");
            File temporary = File.createTempFile("offline-pdf-", ".tmp", context.getCacheDir());
            ParcelFileDescriptor descriptor = null;
            try {
                descriptor = ParcelFileDescriptor.open(temporary, ParcelFileDescriptor.MODE_READ_WRITE);
                if (!temporary.delete()) throw new IOException("offline_pdf_unlink_failed");
                try (FileOutputStream output = new ParcelFileDescriptor.AutoCloseOutputStream(ParcelFileDescriptor.dup(descriptor.getFileDescriptor()))) {
                    output.write(bytes);
                }
                android.system.Os.lseek(descriptor.getFileDescriptor(), 0, android.system.OsConstants.SEEK_SET);
                return descriptor;
            } catch (Exception error) {
                if (descriptor != null) descriptor.close();
                throw error;
            } finally {
                Arrays.fill(bytes, (byte) 0);
                temporary.delete();
            }
        }
    }
}
