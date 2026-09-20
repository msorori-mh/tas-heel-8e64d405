package app.studentamkeen.tamkeen;

import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** CP-01: versioned authenticated encryption. No keys or plaintext are serialized. */
final class ContentEnvelope {
    static final int MAX_BYTES = 100 * 1024 * 1024;
    private static final byte[] MAGIC = new byte[] {'T', 'M', 'K', 'C', 'P', 1, 0, 0};
    static final int OVERHEAD = MAGIC.length + 12 + 16;

    static final class Binding {
        final String ownerId, artifactId, relativePath, sha256;
        final int byteSize;

        Binding(String ownerId, String artifactId, String relativePath, String sha256, int byteSize) {
            if (!identifier(ownerId) || !identifier(artifactId) || relativePath == null ||
                relativePath.length() > 240 || relativePath.startsWith("/") ||
                relativePath.contains("\\") || relativePath.contains(":") ||
                relativePath.matches(".*[\\x00-\\x1f\\x7f].*") ||
                sha256 == null || !sha256.matches("[a-f0-9]{64}") || byteSize <= 0 || byteSize > MAX_BYTES) {
                throw new IllegalArgumentException("OFFLINE_PROTECTION_BINDING_INVALID");
            }
            for (String segment : relativePath.split("/", -1)) {
                if (segment.isEmpty() || segment.equals(".") || segment.equals("..")) {
                    throw new IllegalArgumentException("OFFLINE_PROTECTION_PATH_INVALID");
                }
            }
            this.ownerId = ownerId;
            this.artifactId = artifactId;
            this.relativePath = relativePath;
            this.sha256 = sha256;
            this.byteSize = byteSize;
        }

        byte[] aad() throws Exception {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            try (DataOutputStream output = new DataOutputStream(bytes)) {
                output.write(MAGIC);
                for (String value : new String[] {ownerId, artifactId, relativePath, sha256}) {
                    byte[] encoded = value.getBytes(StandardCharsets.UTF_8);
                    output.writeInt(encoded.length);
                    output.write(encoded);
                }
                output.writeInt(byteSize);
            }
            return bytes.toByteArray();
        }
    }

    static boolean identifier(String value) {
        return value != null && !value.trim().isEmpty() && value.equals(value.trim()) &&
            value.length() <= 160 && !value.matches(".*[\\x00-\\x1f\\x7f].*");
    }

    static String hash(byte[] bytes) throws Exception {
        StringBuilder hex = new StringBuilder(64);
        for (byte value : MessageDigest.getInstance("SHA-256").digest(bytes)) {
            hex.append(Character.forDigit((value >> 4) & 15, 16));
            hex.append(Character.forDigit(value & 15, 16));
        }
        return hex.toString();
    }

    static String hash(String text) throws Exception {
        return hash(text.getBytes(StandardCharsets.UTF_8));
    }

    static void verify(byte[] bytes, Binding binding) throws Exception {
        if (bytes == null || bytes.length != binding.byteSize || !binding.sha256.equals(hash(bytes))) {
            throw new GeneralSecurityException("OFFLINE_PROTECTION_CONTENT_MISMATCH");
        }
    }

    static byte[] seal(byte[] plaintext, Binding binding, SecretKey key) throws Exception {
        verify(plaintext, binding);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        // The provider generates a fresh randomized IV; AndroidKeyStore enforces this.
        cipher.init(Cipher.ENCRYPT_MODE, key);
        byte[] iv = cipher.getIV();
        if (iv.length != 12) throw new GeneralSecurityException("OFFLINE_PROTECTION_IV_INVALID");
        cipher.updateAAD(binding.aad());
        byte[] ciphertext = cipher.doFinal(plaintext);
        byte[] envelope = new byte[MAGIC.length + iv.length + ciphertext.length];
        System.arraycopy(MAGIC, 0, envelope, 0, MAGIC.length);
        System.arraycopy(iv, 0, envelope, MAGIC.length, iv.length);
        System.arraycopy(ciphertext, 0, envelope, MAGIC.length + iv.length, ciphertext.length);
        return envelope;
    }

    static byte[] open(byte[] envelope, Binding binding, SecretKey key) throws Exception {
        if (envelope == null || envelope.length != binding.byteSize + OVERHEAD ||
            !Arrays.equals(MAGIC, Arrays.copyOf(envelope, MAGIC.length))) {
            throw new GeneralSecurityException("OFFLINE_PROTECTION_FORMAT_INVALID");
        }
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key,
            new GCMParameterSpec(128, Arrays.copyOfRange(envelope, MAGIC.length, MAGIC.length + 12)));
        cipher.updateAAD(binding.aad());
        byte[] plaintext = cipher.doFinal(envelope, MAGIC.length + 12, envelope.length - MAGIC.length - 12);
        verify(plaintext, binding);
        return plaintext;
    }
}
