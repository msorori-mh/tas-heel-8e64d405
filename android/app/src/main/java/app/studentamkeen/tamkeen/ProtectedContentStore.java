package app.studentamkeen.tamkeen;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;

/** CP-01: device-local, account-separated encryption at rest, not a server DRM license. */
final class ProtectedContentStore {
    private static final Object LOCK = new Object();
    private final Context context;

    ProtectedContentStore(Context context) { this.context = context.getApplicationContext(); }

    static String keyAlias(String ownerId) throws Exception {
        return "tamkeen.content.v1." + ContentEnvelope.hash(ownerId);
    }

    private SecretKey key(String ownerId, boolean create) throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        String alias = keyAlias(ownerId);
        if (store.containsAlias(alias)) {
            SecretKey key = (SecretKey) store.getKey(alias, null);
            if (key == null) throw new GeneralSecurityException("OFFLINE_PROTECTION_KEY_UNAVAILABLE");
            return key;
        }
        // Never replace a missing key while reading: existing data must not be overwritten.
        if (!create) throw new GeneralSecurityException("OFFLINE_PROTECTION_KEY_UNAVAILABLE");
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(alias,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setKeySize(256)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true)
            // Offline lessons must not require biometric prompts or a network round trip.
            .setUserAuthenticationRequired(false)
            .build());
        return generator.generateKey();
    }

    File encryptedFile(ContentEnvelope.Binding binding) throws Exception {
        File root = new File(context.getNoBackupFilesDir(), "tamkeen/protected-artifacts/v1");
        return confined(root, ContentEnvelope.hash(binding.ownerId) + "/" +
            ContentEnvelope.hash(binding.artifactId) + ".tke");
    }

    File legacyFile(ContentEnvelope.Binding binding) throws Exception {
        String owner = binding.ownerId.replaceAll("[^a-zA-Z0-9_-]", "-");
        return confined(new File(context.getFilesDir(), "tamkeen/offline-artifacts/" + owner), binding.relativePath);
    }

    private File confined(File root, String path) throws Exception {
        File candidate = new File(root, path);
        if (!candidate.getCanonicalPath().startsWith(root.getCanonicalPath() + File.separator)) {
            throw new GeneralSecurityException("OFFLINE_PROTECTION_PATH_INVALID");
        }
        return candidate;
    }

    private byte[] readBounded(FileInputStream input, int max) throws Exception {
        try (FileInputStream stream = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int length;
            while ((length = stream.read(buffer)) != -1) {
                if (output.size() + length > max) throw new IOException("OFFLINE_PROTECTION_SIZE_INVALID");
                output.write(buffer, 0, length);
            }
            return output.toByteArray();
        }
    }

    private byte[] readEncrypted(AtomicFile file, ContentEnvelope.Binding binding) throws Exception {
        return ContentEnvelope.open(readBounded(file.openRead(), binding.byteSize + ContentEnvelope.OVERHEAD),
            binding, key(binding.ownerId, false));
    }

    private void removeLegacy(ContentEnvelope.Binding binding) throws Exception {
        File legacy = legacyFile(binding);
        if (legacy.exists() && !legacy.delete()) throw new IOException("OFFLINE_PROTECTION_MIGRATION_PENDING");
    }

    void save(ContentEnvelope.Binding binding, byte[] bytes) throws Exception {
        synchronized (LOCK) {
            byte[] envelope = ContentEnvelope.seal(bytes, binding, key(binding.ownerId, true));
            AtomicFile file = new AtomicFile(encryptedFile(binding));
            FileOutputStream output = null;
            try {
                output = file.startWrite();
                output.write(envelope);
                file.finishWrite(output);
                output = null;
            } finally {
                if (output != null) file.failWrite(output);
            }
            // Only remove the old file after the persisted ciphertext decrypts and hashes correctly.
            readEncrypted(file, binding);
            removeLegacy(binding);
        }
    }

    byte[] read(ContentEnvelope.Binding binding) throws Exception {
        synchronized (LOCK) {
            AtomicFile encrypted = new AtomicFile(encryptedFile(binding));
            // Once encrypted data exists, corruption or key loss must NEVER fall back to plaintext.
            if (encrypted.exists()) {
                byte[] bytes = readEncrypted(encrypted, binding);
                removeLegacy(binding);
                return bytes;
            }
            File legacy = legacyFile(binding);
            if (!legacy.isFile()) return null;
            if (legacy.length() != binding.byteSize) throw new IOException("OFFLINE_PROTECTION_CONTENT_MISMATCH");
            byte[] bytes = readBounded(new FileInputStream(legacy), binding.byteSize);
            ContentEnvelope.verify(bytes, binding);
            save(binding, bytes);
            return bytes;
        }
    }

    void remove(ContentEnvelope.Binding binding) throws Exception {
        synchronized (LOCK) {
            AtomicFile file = new AtomicFile(encryptedFile(binding));
            file.delete();
            if (file.exists()) throw new IOException("OFFLINE_PROTECTION_REMOVE_FAILED");
            removeLegacy(binding);
        }
    }
}
