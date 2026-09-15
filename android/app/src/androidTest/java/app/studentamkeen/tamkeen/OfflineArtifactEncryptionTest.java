package app.studentamkeen.tamkeen;

import android.content.Context;
import android.content.ContextWrapper;
import android.database.DatabaseErrorHandler;
import android.database.sqlite.SQLiteDatabase;
import android.graphics.Bitmap;
import android.graphics.pdf.PdfDocument;
import android.graphics.pdf.PdfRenderer;
import android.os.ParcelFileDescriptor;
import android.util.AtomicFile;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.Arrays;
import static org.junit.Assert.*;

/** Real Keystore, AtomicFile and PDFium; all data is TEST_ONLY and separately rooted. */
@RunWith(AndroidJUnit4.class)
public class OfflineArtifactEncryptionTest {
    private Context context;
    private File isolated;
    private final String owner = "TEST_ONLY_student_a";
    private final byte[] body = "TEST_ONLY_private_lesson_content".getBytes(StandardCharsets.UTF_8);

    @Before public void prepare() {
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        isolated = new File(target.getCacheDir(), "TEST_ONLY_artifacts_" + System.nanoTime());
        isolated.mkdirs();
        context = new ContextWrapper(target) {
            @Override public File getFilesDir() { File file = new File(isolated, "files"); file.mkdirs(); return file; }
            @Override public File getCacheDir() { File file = new File(isolated, "cache"); file.mkdirs(); return file; }
            @Override public File getDatabasePath(String name) { return new File(isolated, name); }
            @Override public SQLiteDatabase openOrCreateDatabase(String name, int mode, SQLiteDatabase.CursorFactory factory) {
                return SQLiteDatabase.openOrCreateDatabase(getDatabasePath(name), factory);
            }
            @Override public SQLiteDatabase openOrCreateDatabase(String name, int mode, SQLiteDatabase.CursorFactory factory, DatabaseErrorHandler handler) {
                return SQLiteDatabase.openOrCreateDatabase(getDatabasePath(name).getPath(), factory, handler);
            }
        };
    }
    @After public void cleanup() { delete(isolated); }
    private void delete(File file) {
        File[] children = file.listFiles();
        if (children != null) for (File child : children) {
            // Do not follow the traversal-test symlink outside its own directory.
            if (Files.isSymbolicLink(child.toPath())) child.delete(); else delete(child);
        }
        assertTrue("TEST_ONLY cleanup: " + file.getName(), !file.exists() || file.delete());
    }
    private JSONObject artifact(byte[] bytes) throws Exception {
        StringBuilder sha = new StringBuilder();
        for (byte b : MessageDigest.getInstance("SHA-256").digest(bytes)) sha.append(String.format(java.util.Locale.ROOT, "%02x", b & 0xff));
        return new JSONObject().put("artifactId", "TEST_ONLY_artifact").put("resourceId", "TEST_ONLY_resource")
            .put("relativePath", "packs/lesson.html").put("byteSize", bytes.length).put("sha256", sha.toString())
            .put("kind", "lesson-html").put("contentType", "text/html");
    }
    private File legacy(String user, JSONObject artifact) throws Exception {
        return new File(context.getFilesDir(), "tamkeen/offline-artifacts/" + user + "/" + artifact.getString("relativePath"));
    }
    private void write(File file, byte[] bytes) throws Exception {
        file.getParentFile().mkdirs();
        try (FileOutputStream output = new FileOutputStream(file)) { output.write(bytes); output.getFD().sync(); }
    }
    private JSONObject record(String user, JSONObject artifact) throws Exception {
        return new JSONObject().put("ownerId", user).put("status", "ready")
            .put("verifiedArtifactIds", new JSONArray().put(artifact.getString("artifactId")))
            .put("manifest", new JSONObject().put("artifacts", new JSONArray().put(artifact)));
    }
    private void register(JSONObject artifact, String... users) throws Exception {
        JSONArray packs = new JSONArray();
        for (String user : users) packs.put(record(user, artifact));
        TamkeenOfflineStateStore.write(context, new JSONObject().put("schemaVersion", 1)
            .put("activeOwnerId", owner).put("updatedAt", "2026-09-10T00:00:00.000Z")
            .put("packs", packs).put("packBackups", new JSONArray()).put("outbox", new JSONArray()).put("learning", new JSONArray()));
    }

    @Test public void encryptsRoundTripsAndUsesDifferentNonces() throws Exception {
        JSONObject artifact = artifact(body);
        TamkeenOfflineArtifactStore.save(context, owner, artifact, body);
        File file = TamkeenOfflineArtifactStore.encryptedFile(context, owner, artifact);
        byte[] first = Files.readAllBytes(file.toPath());
        assertArrayEquals(body, TamkeenOfflineArtifactStore.read(context, owner, artifact));
        assertFalse(new String(first, StandardCharsets.UTF_8).contains("TEST_ONLY_private_lesson_content"));
        assertEquals(body.length + 32, first.length);
        TamkeenOfflineArtifactStore.save(context, owner, artifact, body);
        assertFalse(Arrays.equals(first, Files.readAllBytes(file.toPath())));
    }
    @Test public void rejectsTamperingWithoutPlaintextFallback() throws Exception {
        JSONObject artifact = artifact(body);
        TamkeenOfflineArtifactStore.save(context, owner, artifact, body);
        File file = TamkeenOfflineArtifactStore.encryptedFile(context, owner, artifact);
        byte[] envelope = Files.readAllBytes(file.toPath());
        envelope[envelope.length - 1] ^= 1;
        write(file, envelope); write(legacy(owner, artifact), body);
        try { TamkeenOfflineArtifactStore.read(context, owner, artifact); fail("Must authenticate ciphertext"); }
        catch (javax.crypto.AEADBadTagException expected) { /* expected */ }
        assertTrue(legacy(owner, artifact).exists());
    }
    @Test public void migratesVerifiedLegacyAndPreservesOtherRevisions() throws Exception {
        JSONObject artifact = artifact(body);
        File old = legacy(owner, artifact); write(old, body);
        assertArrayEquals(body, TamkeenOfflineArtifactStore.read(context, owner, artifact));
        assertFalse(old.exists());
        byte[] previous = "TEST_ONLY_previous_revision".getBytes(StandardCharsets.UTF_8);
        JSONObject previousArtifact = artifact(previous);
        write(old, previous);
        TamkeenOfflineArtifactStore.save(context, owner, artifact, body);
        assertTrue(old.exists());
        assertArrayEquals(previous, TamkeenOfflineArtifactStore.read(context, owner, previousArtifact));
        assertFalse(old.exists());
        assertArrayEquals(body, TamkeenOfflineArtifactStore.read(context, owner, artifact));
    }
    @Test public void bindsCiphertextToOwnerAndPathAndRejectsUnregisteredReads() throws Exception {
        JSONObject artifact = artifact(body); register(artifact, owner);
        TamkeenOfflineArtifactStore.save(context, owner, artifact, body);
        byte[] envelope = Files.readAllBytes(TamkeenOfflineArtifactStore.encryptedFile(context, owner, artifact).toPath());
        String other = "TEST_ONLY_student_b";
        write(TamkeenOfflineArtifactStore.encryptedFile(context, other, artifact), envelope);
        try { TamkeenOfflineArtifactStore.read(context, other, artifact); fail("Cross-account ciphertext must fail"); }
        catch (javax.crypto.AEADBadTagException expected) { /* expected */ }
        JSONObject moved = new JSONObject(artifact.toString()).put("relativePath", "packs/other.html");
        write(TamkeenOfflineArtifactStore.encryptedFile(context, owner, moved), envelope);
        try { TamkeenOfflineArtifactStore.read(context, owner, moved); fail("Moved ciphertext must fail"); }
        catch (javax.crypto.AEADBadTagException expected) { /* expected */ }
        try { TamkeenOfflineArtifactStore.authorizedArtifact(context, other, artifact, true); fail("Inactive owner"); }
        catch (java.io.IOException expected) { assertEquals("offline_state_owner_changed", expected.getMessage()); }
        try { TamkeenOfflineArtifactStore.authorizedArtifact(context, owner, moved, true); fail("Unregistered path"); }
        catch (java.io.IOException expected) { assertEquals("offline_artifact_not_registered", expected.getMessage()); }
    }
    @Test public void preservesInstalledBytesAfterInterruptedAtomicWrite() throws Exception {
        JSONObject artifact = artifact(body);
        TamkeenOfflineArtifactStore.save(context, owner, artifact, body);
        AtomicFile file = new AtomicFile(TamkeenOfflineArtifactStore.encryptedFile(context, owner, artifact));
        try (FileOutputStream partial = file.startWrite()) { partial.write(new byte[] { 1, 2, 3 }); }
        // Simulate process termination: no finishWrite/failWrite.
        assertArrayEquals(body, TamkeenOfflineArtifactStore.read(context, owner, artifact));
    }
    @Test public void preservesLegacyWhenStorageCannotCommit() throws Exception {
        JSONObject artifact = artifact(body); File old = legacy(owner, artifact); write(old, body);
        File blocked = new File(context.getFilesDir(), TamkeenOfflineArtifactStore.ROOT); write(blocked, body);
        try { TamkeenOfflineArtifactStore.read(context, owner, artifact); fail("Blocked disk path cannot commit"); }
        catch (java.io.IOException expected) { /* expected */ }
        assertArrayEquals(body, Files.readAllBytes(old.toPath()));
    }
    @Test public void migratesSharedPdfOnlyAfterEveryReferencingOwnerHasAnEncryptedCopy() throws Exception {
        JSONObject artifact = artifact(body).put("kind", "textbook-pdf").put("contentType", "application/pdf");
        String other = "TEST_ONLY_student_b"; register(artifact, owner, other);
        File shared = new File(context.getFilesDir(), "tamkeen/pdf/TEST_ONLY_resource.bin"); write(shared, body);
        assertArrayEquals(body, TamkeenOfflineArtifactStore.read(context, owner, artifact));
        assertTrue(shared.exists());
        assertArrayEquals(body, TamkeenOfflineArtifactStore.read(context, other, artifact));
        assertFalse(shared.exists());
        assertArrayEquals(body, TamkeenOfflineArtifactStore.read(context, owner, artifact));
    }
    @Test public void rendersEncryptedPdfWithoutLeavingANamedPlaintextFile() throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        PdfDocument document = new PdfDocument();
        try {
            PdfDocument.Page page = document.startPage(new PdfDocument.PageInfo.Builder(200, 200, 1).create());
            page.getCanvas().drawColor(android.graphics.Color.WHITE); document.finishPage(page); document.writeTo(bytes);
        } finally { document.close(); }
        JSONObject artifact = artifact(bytes.toByteArray()).put("kind", "textbook-pdf").put("contentType", "application/pdf");
        register(artifact, owner); TamkeenOfflineArtifactStore.save(context, owner, artifact, bytes.toByteArray());
        try (ParcelFileDescriptor descriptor = TamkeenOfflineArtifactStore.pdfDescriptor(context, owner, artifact);
             PdfRenderer renderer = new PdfRenderer(descriptor)) {
            assertEquals(1, renderer.getPageCount());
            try (PdfRenderer.Page page = renderer.openPage(0)) {
                Bitmap bitmap = Bitmap.createBitmap(200, 200, Bitmap.Config.ARGB_8888);
                page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
                assertEquals(android.graphics.Color.WHITE, bitmap.getPixel(50, 50)); bitmap.recycle();
            }
            assertEquals(0, context.getCacheDir().list().length);
        }
        assertEquals(0, context.getCacheDir().list().length);
        assertTrue(TamkeenOfflineArtifactStore.encryptedFile(context, owner, artifact).exists());
    }
    @Test public void rejectsTraversalAndSizeMismatchBeforePersistence() throws Exception {
        JSONObject artifact = artifact(body);
        try { TamkeenOfflineArtifactStore.save(context, "../other", artifact, body); fail("Owner traversal"); }
        catch (IllegalArgumentException expected) { /* expected */ }
        JSONObject traversal = new JSONObject(artifact.toString()).put("relativePath", "packs/../../other");
        try { TamkeenOfflineArtifactStore.save(context, owner, traversal, body); fail("Path traversal"); }
        catch (IllegalArgumentException expected) { /* expected */ }
        try { TamkeenOfflineArtifactStore.save(context, owner, artifact, new byte[] { 1 }); fail("Wrong size"); }
        catch (java.io.IOException expected) { /* expected */ }
        assertFalse(TamkeenOfflineArtifactStore.encryptedFile(context, owner, artifact).exists());
    }
}
