package app.studentamkeen.tamkeen;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;

/** JVM crypto checks only; does not substitute for AndroidKeyStore/device testing. */
public final class ContentEnvelopeCheck {
    interface Check { void run() throws Exception; }
    static int count;
    static void require(boolean value) { if (!value) throw new AssertionError(); count++; }
    static void rejects(Check operation) throws Exception {
        try { operation.run(); } catch (java.security.GeneralSecurityException | IllegalArgumentException expected) { count++; return; }
        throw new AssertionError("Tampered envelope or binding was accepted");
    }
    public static void main(String[] args) throws Exception {
        KeyGenerator generator = KeyGenerator.getInstance("AES"); generator.init(256);
        SecretKey key = generator.generateKey(), otherDevice = generator.generateKey();
        for (String body : new String[] {
            "{\"question\":\"ما الوحدة الأساسية للحياة؟\",\"correctOptionId\":\"a\"}",
            "<html dir='rtl'><body>خريطة ذهنية</body></html>",
            "<html><button onclick='run()'>تجربة</button><script>function run(){return 1}</script></html>"
        }) {
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            ContentEnvelope.Binding binding = new ContentEnvelope.Binding("student-a", "artifact-a", "packs/a.html", ContentEnvelope.hash(bytes), bytes.length);
            byte[] sealed = ContentEnvelope.seal(bytes, binding, key);
            require(Arrays.equals(bytes, ContentEnvelope.open(sealed, binding, key)));
            require(!new String(sealed, StandardCharsets.UTF_8).contains(body));
            require(!Arrays.equals(sealed, ContentEnvelope.seal(bytes, binding, key)));
            rejects(() -> ContentEnvelope.open(sealed, binding, otherDevice));
            rejects(() -> ContentEnvelope.open(sealed, new ContentEnvelope.Binding("student-b", binding.artifactId, binding.relativePath, binding.sha256, binding.byteSize), key));
            rejects(() -> ContentEnvelope.open(sealed, new ContentEnvelope.Binding(binding.ownerId, "artifact-b", binding.relativePath, binding.sha256, binding.byteSize), key));
            rejects(() -> ContentEnvelope.open(sealed, new ContentEnvelope.Binding(binding.ownerId, binding.artifactId, "packs/b.html", binding.sha256, binding.byteSize), key));
            for (int offset : new int[] {0, 9, sealed.length - 1}) {
                byte[] corrupt = sealed.clone(); corrupt[offset] ^= 1;
                rejects(() -> ContentEnvelope.open(corrupt, binding, key));
            }
            rejects(() -> ContentEnvelope.open(Arrays.copyOf(sealed, sealed.length - 1), binding, key));
            rejects(() -> ContentEnvelope.seal(new byte[bytes.length], binding, key));
        }
        System.out.println("Content envelope JVM checks: " + count + " PASS; Android acceptance remains HOLD");
    }
}
