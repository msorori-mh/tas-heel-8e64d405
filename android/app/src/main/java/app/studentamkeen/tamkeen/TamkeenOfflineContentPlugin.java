package app.studentamkeen.tamkeen;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;

/**
 * OFFLINE-04/05 — narrow bridge for the APK-bundled offline entry.
 *
 * The page may provide a lesson id only. It can never provide an owner id or a
 * filesystem path. This plugin resolves the active owner from the private
 * OFFLINE-01 journal, accepts READY + verified lesson/assessment artifacts only, confines
 * every path to the owner's private root, and checks exact size + SHA-256
 * before returning bytes.
 */
@CapacitorPlugin(name = "TamkeenOfflineContent")
public class TamkeenOfflineContentPlugin extends Plugin {

    private static final String STATE_PATH = "tamkeen/offline/foundation-v1.json";
    private static final String STATE_BACKUP_PATH = "tamkeen/offline/foundation-v1.backup.json";
    private static final String ARTIFACT_ROOT = "tamkeen/offline-artifacts";
    private static final long MAX_STATE_BYTES = 16L * 1024 * 1024;
    private static final long MAX_TEXT_ARTIFACT_BYTES = 5L * 1024 * 1024;
    private static final long MAX_LESSON_RESPONSE_BYTES = 20L * 1024 * 1024;
    private static final Object STATE_WRITE_LOCK = new Object();

    private byte[] readBytes(File file, long maximumBytes) throws Exception {
        if (!file.exists() || !file.isFile() || file.length() <= 0 || file.length() > maximumBytes) {
            return null;
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream((int) file.length());
        try (FileInputStream in = new FileInputStream(file)) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) != -1) {
                if (out.size() + read > maximumBytes) return null;
                out.write(buffer, 0, read);
            }
        }
        return out.toByteArray();
    }

    private JSONObject readStatePath(String relativePath) {
        try {
            byte[] bytes = readBytes(new File(getContext().getFilesDir(), relativePath), MAX_STATE_BYTES);
            if (bytes == null) return null;
            JSONObject state = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
            if (state.optInt("schemaVersion", -1) != 1) return null;
            if (state.optJSONArray("packs") == null) return null;
            return state;
        } catch (Exception ignored) {
            return null;
        }
    }

    private JSONObject readState() {
        JSONObject primary = readStatePath(STATE_PATH);
        return primary != null ? primary : readStatePath(STATE_BACKUP_PATH);
    }

    private String activeOwner(JSONObject state) {
        if (state == null || state.isNull("activeOwnerId")) return null;
        String ownerId = state.optString("activeOwnerId", "").trim();
        if (ownerId.isEmpty() || ownerId.length() > 160) return null;
        return ownerId;
    }

    private String ownerSegment(String ownerId) {
        String value = ownerId.replaceAll("[^a-zA-Z0-9_-]", "-");
        return value.isEmpty() ? null : value;
    }

    private boolean isPrivateRelativePath(String path) {
        if (path == null) return false;
        String value = path.trim();
        if (value.isEmpty() || value.length() > 240) return false;
        if (value.startsWith("/") || value.contains("..") || value.contains("://")) return false;
        return true;
    }

    private boolean containsString(JSONArray values, String expected) {
        if (values == null || expected == null) return false;
        for (int index = 0; index < values.length(); index++) {
            if (expected.equals(values.optString(index, null))) return true;
        }
        return false;
    }

    private boolean isTextKind(String kind) {
        return "lesson-html".equals(kind) || "quick-review".equals(kind);
    }

    private boolean isAssessmentKind(String kind) {
        return "assessment".equals(kind) || "self-test".equals(kind);
    }

    private boolean isSupportedKind(String kind) {
        return isTextKind(kind) || isAssessmentKind(kind);
    }

    private boolean assessmentBinding(JSONObject artifact) {
        String kind = artifact.optString("kind", "");
        String resourceId = artifact.optString("resourceId", "");
        if ("assessment".equals(kind)) return resourceId.startsWith("official-questions:");
        if ("self-test".equals(kind)) return resourceId.startsWith("self-test:");
        return false;
    }

    private String sourceType(JSONObject artifact) {
        String resourceId = artifact.optString("resourceId", "");
        int separator = resourceId.indexOf(':');
        if (separator <= 0) return null;
        String type = resourceId.substring(0, separator);
        if (
            !"official-book".equals(type) &&
            !"tamkeen-explanation".equals(type) &&
            !"quick-review".equals(type) &&
            !"mind-map".equals(type) &&
            !"lab-experiment".equals(type)
        ) return null;
        return type;
    }

    private String sha256(byte[] bytes) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
        StringBuilder hex = new StringBuilder(digest.length * 2);
        for (byte value : digest) hex.append(String.format(Locale.ROOT, "%02x", value & 0xff));
        return hex.toString();
    }

    private String sha256(String value) throws Exception {
        return sha256(value.getBytes(StandardCharsets.UTF_8));
    }

    private String nowIso() {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date());
    }

    private String joinParts(List<String> values) {
        StringBuilder joined = new StringBuilder();
        for (String value : values) {
            if (joined.length() > 0) joined.append('|');
            joined.append(value);
        }
        return joined.toString();
    }

    private String jsonString(String value) {
        StringBuilder encoded = new StringBuilder(value.length() + 2);
        encoded.append('"');
        for (int index = 0; index < value.length(); index++) {
            char character = value.charAt(index);
            switch (character) {
                case '"': encoded.append("\\\""); break;
                case '\\': encoded.append("\\\\"); break;
                case '\b': encoded.append("\\b"); break;
                case '\f': encoded.append("\\f"); break;
                case '\n': encoded.append("\\n"); break;
                case '\r': encoded.append("\\r"); break;
                case '\t': encoded.append("\\t"); break;
                default:
                    if (character <= 0x1f || (
                        Character.isSurrogate(character) &&
                        !(
                            Character.isHighSurrogate(character) &&
                            index + 1 < value.length() &&
                            Character.isLowSurrogate(value.charAt(index + 1))
                        )
                    )) {
                        encoded.append(String.format(Locale.ROOT, "\\u%04x", (int) character));
                    } else {
                        encoded.append(character);
                        if (Character.isHighSurrogate(character)) {
                            encoded.append(value.charAt(++index));
                        }
                    }
            }
        }
        encoded.append('"');
        return encoded.toString();
    }

    private String mutationPayloadJson(
        String ownerId,
        String idempotencyKey,
        String kind,
        String entityId,
        String lessonId,
        String occurredAt,
        Integer progressPercent,
        String answerText
    ) {
        return "[" +
            jsonString(ownerId) + "," +
            jsonString(idempotencyKey) + "," +
            jsonString(kind) + "," +
            jsonString(entityId) + "," +
            (lessonId == null ? "null" : jsonString(lessonId)) + "," +
            jsonString(occurredAt) + "," +
            (progressPercent == null ? "null" : progressPercent) + "," +
            (answerText == null ? "null" : jsonString(answerText)) +
            "]";
    }

    private JSONArray mutableArray(JSONObject state, String key) throws Exception {
        JSONArray current = state.optJSONArray(key);
        if (current != null) return current;
        JSONArray created = new JSONArray();
        state.put(key, created);
        return created;
    }

    private void writeUtf8(File file, String value) throws Exception {
        byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
        if (bytes.length <= 0 || bytes.length > MAX_STATE_BYTES) {
            throw new IllegalStateException("offline_state_size_invalid");
        }
        try (FileOutputStream output = new FileOutputStream(file, false)) {
            output.write(bytes);
            output.flush();
            output.getFD().sync();
        }
    }

    private void replaceState(JSONObject next, String previous) throws Exception {
        String encoded = next.toString();
        File root = new File(getContext().getFilesDir(), "tamkeen/offline");
        if (!root.exists() && !root.mkdirs()) {
            throw new IllegalStateException("offline_state_directory_failed");
        }
        File primary = new File(getContext().getFilesDir(), STATE_PATH);
        File backup = new File(getContext().getFilesDir(), STATE_BACKUP_PATH);
        File temporary = new File(root, "foundation-v1.next.json");
        boolean installed = false;
        try {
            writeUtf8(temporary, encoded);
            writeUtf8(backup, previous);
            if (primary.exists() && !primary.delete()) {
                throw new IllegalStateException("offline_state_replace_failed");
            }
            if (!temporary.renameTo(primary)) {
                throw new IllegalStateException("offline_state_replace_failed");
            }
            installed = true;
        } finally {
            if (!installed && temporary.exists()) temporary.delete();
        }
    }

    private JSONObject findLearning(JSONArray learning, String ownerId, String id) {
        for (int index = 0; index < learning.length(); index++) {
            JSONObject record = learning.optJSONObject(index);
            if (
                record != null &&
                ownerId.equals(record.optString("ownerId", "")) &&
                id.equals(record.optString("id", ""))
            ) return record;
        }
        return null;
    }

    private void replaceLearning(JSONArray learning, JSONObject replacement) throws Exception {
        String ownerId = replacement.getString("ownerId");
        String id = replacement.getString("id");
        for (int index = learning.length() - 1; index >= 0; index--) {
            JSONObject record = learning.optJSONObject(index);
            if (
                record != null &&
                ownerId.equals(record.optString("ownerId", "")) &&
                id.equals(record.optString("id", ""))
            ) learning.remove(index);
        }
        learning.put(replacement);
    }

    private void enqueueOutbox(
        JSONArray outbox,
        String ownerId,
        String idempotencyKey,
        String kind,
        String entityId,
        String lessonId,
        String occurredAt,
        Integer progressPercent,
        String answerText
    ) throws Exception {
        String payloadSha = sha256(
            mutationPayloadJson(
                ownerId,
                idempotencyKey,
                kind,
                entityId,
                lessonId,
                occurredAt,
                progressPercent,
                answerText
            )
        );
        for (int index = 0; index < outbox.length(); index++) {
            JSONObject current = outbox.optJSONObject(index);
            if (
                current != null &&
                ownerId.equals(current.optString("ownerId", "")) &&
                idempotencyKey.equals(current.optString("idempotencyKey", ""))
            ) {
                if (!payloadSha.equals(current.optString("payloadSha256", ""))) {
                    throw new IllegalStateException("offline_outbox_idempotency_conflict");
                }
                return;
            }
        }
        String now = occurredAt;
        JSONObject operation = new JSONObject();
        operation.put("id", "op-" + sha256(ownerId + "\u0000" + idempotencyKey).substring(0, 40));
        operation.put("ownerId", ownerId);
        operation.put("idempotencyKey", idempotencyKey);
        operation.put("kind", kind);
        operation.put("entityId", entityId);
        operation.put("lessonId", lessonId == null ? JSONObject.NULL : lessonId);
        operation.put("occurredAt", occurredAt);
        operation.put("progressPercent", progressPercent == null ? JSONObject.NULL : progressPercent);
        operation.put("answerText", answerText == null ? JSONObject.NULL : answerText);
        operation.put("payloadSha256", payloadSha);
        operation.put("status", "pending");
        operation.put("attempts", 0);
        operation.put("nextAttemptAt", now);
        operation.put("leaseUntil", JSONObject.NULL);
        operation.put("lastErrorCode", JSONObject.NULL);
        operation.put("createdAt", now);
        operation.put("updatedAt", now);
        operation.put("deliveredAt", JSONObject.NULL);
        outbox.put(operation);
    }

    private void persistOfficialAttempt(
        String ownerId,
        String lessonId,
        String questionId,
        String revisionId,
        String answerText
    ) throws Exception {
        synchronized (STATE_WRITE_LOCK) {
            JSONObject state = readState();
            if (state == null || !ownerId.equals(activeOwner(state))) {
                throw new IllegalStateException("offline_state_owner_changed");
            }
            String previous = state.toString();
            JSONArray learning = mutableArray(state, "learning");
            JSONArray outbox = mutableArray(state, "outbox");
            String id = "learn-" + sha256(
                ownerId + "\u0000" + lessonId + "\u0000" + questionId + "\u0000official-question-note"
            ).substring(0, 40);
            JSONObject current = findLearning(learning, ownerId, id);
            String now = nowIso();
            String effectiveAt = current != null && answerText.equals(current.optString("answerText", ""))
                ? current.optString("updatedAt", now)
                : now;
            JSONObject record = new JSONObject();
            record.put("id", id);
            record.put("ownerId", ownerId);
            record.put("lessonId", lessonId);
            record.put("questionId", questionId);
            record.put("revisionId", revisionId);
            record.put("kind", "official-question-note");
            record.put("answerText", answerText);
            record.put("selectedOptionId", JSONObject.NULL);
            record.put("isCorrect", JSONObject.NULL);
            record.put("updatedAt", effectiveAt);
            replaceLearning(learning, record);

            String operationDigest = sha256(
                ownerId + "\u0000" + lessonId + "\u0000" + questionId + "\u0000" + answerText + "\u0000" + effectiveAt
            );
            enqueueOutbox(
                outbox,
                ownerId,
                "note-" + operationDigest.substring(0, 48),
                "official-question-note",
                questionId,
                lessonId,
                effectiveAt,
                null,
                answerText
            );
            state.put("updatedAt", now);
            replaceState(state, previous);
        }
    }

    private int persistSelfTestAttempt(
        String ownerId,
        String lessonId,
        String questionId,
        String revisionId,
        String selectedOptionId,
        boolean isCorrect
    ) throws Exception {
        synchronized (STATE_WRITE_LOCK) {
            JSONObject state = readState();
            if (state == null || !ownerId.equals(activeOwner(state))) {
                throw new IllegalStateException("offline_state_owner_changed");
            }
            String previous = state.toString();
            JSONArray learning = mutableArray(state, "learning");
            JSONArray outbox = mutableArray(state, "outbox");
            String id = "learn-" + sha256(
                ownerId + "\u0000" + lessonId + "\u0000" + questionId + "\u0000self-test-attempt"
            ).substring(0, 40);
            JSONObject current = findLearning(learning, ownerId, id);
            String now = nowIso();
            boolean unchanged =
                current != null &&
                revisionId.equals(current.optString("revisionId", "")) &&
                selectedOptionId.equals(current.optString("selectedOptionId", "")) &&
                isCorrect == current.optBoolean("isCorrect", !isCorrect);
            String effectiveAt = unchanged ? current.optString("updatedAt", now) : now;
            JSONObject record = new JSONObject();
            record.put("id", id);
            record.put("ownerId", ownerId);
            record.put("lessonId", lessonId);
            record.put("questionId", questionId);
            record.put("revisionId", revisionId);
            record.put("kind", "self-test-attempt");
            record.put("answerText", JSONObject.NULL);
            record.put("selectedOptionId", selectedOptionId);
            record.put("isCorrect", isCorrect);
            record.put("updatedAt", effectiveAt);
            replaceLearning(learning, record);

            int attempts = 0;
            int correct = 0;
            List<String> snapshotParts = new ArrayList<>();
            for (int index = 0; index < learning.length(); index++) {
                JSONObject candidate = learning.optJSONObject(index);
                if (
                    candidate == null ||
                    !ownerId.equals(candidate.optString("ownerId", "")) ||
                    !lessonId.equals(candidate.optString("lessonId", "")) ||
                    !"self-test-attempt".equals(candidate.optString("kind", ""))
                ) continue;
                attempts += 1;
                if (candidate.optBoolean("isCorrect", false)) correct += 1;
                snapshotParts.add(
                    candidate.optString("questionId", "") + ":" +
                    candidate.optString("revisionId", "null") + ":" +
                    candidate.optString("selectedOptionId", "null") + ":" +
                    candidate.optBoolean("isCorrect", false)
                );
            }
            Collections.sort(snapshotParts);
            String snapshotKey = joinParts(snapshotParts);
            int scorePercent = attempts == 0 ? 0 : Math.round((correct * 100f) / attempts);
            String progressDigest = sha256(
                ownerId + "\u0000" + lessonId + "\u0000" + snapshotKey + "\u0000" + effectiveAt
            );
            enqueueOutbox(
                outbox,
                ownerId,
                "progress-" + progressDigest.substring(0, 44),
                "lesson-progress",
                lessonId,
                null,
                effectiveAt,
                scorePercent,
                null
            );
            state.put("updatedAt", now);
            replaceState(state, previous);
            return scorePercent;
        }
    }

    private byte[] verifiedArtifactBytes(
        String ownerId,
        JSONObject record,
        JSONObject artifact
    ) {
        try {
            if (!"ready".equals(record.optString("status", ""))) return null;
            if (!ownerId.equals(record.optString("ownerId", ""))) return null;
            String kind = artifact.optString("kind", "");
            if (!isSupportedKind(kind)) return null;
            if (isTextKind(kind) && sourceType(artifact) == null) return null;
            if (isAssessmentKind(kind) && !assessmentBinding(artifact)) return null;

            String artifactId = artifact.optString("artifactId", "");
            if (artifactId.isEmpty() || artifactId.length() > 160) return null;
            if (!containsString(record.optJSONArray("verifiedArtifactIds"), artifactId)) return null;

            String relativePath = artifact.optString("relativePath", "");
            if (!isPrivateRelativePath(relativePath)) return null;
            long expectedSize = artifact.optLong("byteSize", -1L);
            if (expectedSize <= 0 || expectedSize > MAX_TEXT_ARTIFACT_BYTES) return null;
            String expectedSha = artifact.optString("sha256", "").toLowerCase(Locale.ROOT);
            if (!expectedSha.matches("^[a-f0-9]{64}$")) return null;

            String segment = ownerSegment(ownerId);
            if (segment == null) return null;
            File root = new File(getContext().getFilesDir(), ARTIFACT_ROOT + File.separator + segment);
            File candidate = new File(root, relativePath);
            String canonicalRoot = root.getCanonicalPath();
            String canonicalCandidate = candidate.getCanonicalPath();
            if (!canonicalCandidate.startsWith(canonicalRoot + File.separator)) return null;
            if (!candidate.exists() || !candidate.isFile() || candidate.length() != expectedSize) return null;

            byte[] bytes = readBytes(candidate, MAX_TEXT_ARTIFACT_BYTES);
            if (bytes == null || bytes.length != expectedSize) return null;
            if (!expectedSha.equals(sha256(bytes))) return null;
            return bytes;
        } catch (Exception ignored) {
            return null;
        }
    }

    private String safeLabel(JSONObject value, String key, String fallback) {
        String label = value.optString(key, fallback).trim();
        if (label.isEmpty()) label = fallback;
        return label.length() <= 240 ? label : label.substring(0, 240);
    }

    @PluginMethod
    public void listSavedSubjects(PluginCall call) {
        JSONObject state = readState();
        String ownerId = activeOwner(state);
        JSArray subjects = new JSArray();
        if (state == null || ownerId == null) {
            JSObject result = new JSObject();
            result.put("subjects", subjects);
            call.resolve(result);
            return;
        }

        JSONArray records = state.optJSONArray("packs");
        for (int recordIndex = 0; recordIndex < records.length(); recordIndex++) {
            JSONObject record = records.optJSONObject(recordIndex);
            if (record == null || !ownerId.equals(record.optString("ownerId", ""))) continue;
            if (!"ready".equals(record.optString("status", ""))) continue;
            JSONObject manifest = record.optJSONObject("manifest");
            JSONObject scope = manifest == null ? null : manifest.optJSONObject("scope");
            JSONArray artifacts = manifest == null ? null : manifest.optJSONArray("artifacts");
            if (scope == null || artifacts == null) continue;
            String subjectId = scope.optString("subjectId", "").trim();
            if (subjectId.isEmpty() || subjectId.length() > 160) continue;

            Map<String, JSObject> lessons = new LinkedHashMap<>();
            for (int artifactIndex = 0; artifactIndex < artifacts.length(); artifactIndex++) {
                JSONObject artifact = artifacts.optJSONObject(artifactIndex);
                if (artifact == null || verifiedArtifactBytes(ownerId, record, artifact) == null) continue;
                String lessonId = artifact.optString("lessonId", "").trim();
                if (lessonId.isEmpty() || lessonId.length() > 160) continue;
                JSObject lesson = lessons.get(lessonId);
                if (lesson == null) {
                    lesson = new JSObject();
                    lesson.put("lessonId", lessonId);
                    lesson.put("title", safeLabel(artifact, "lessonTitle", "درس محفوظ"));
                    lesson.put("artifactCount", 0);
                    lessons.put(lessonId, lesson);
                }
                lesson.put("artifactCount", lesson.optInt("artifactCount", 0) + 1);
            }
            if (lessons.isEmpty()) continue;

            JSArray lessonList = new JSArray();
            for (JSObject lesson : lessons.values()) lessonList.put(lesson);
            JSObject subject = new JSObject();
            subject.put("subjectId", subjectId);
            subject.put("title", safeLabel(scope, "subjectTitle", "مادة محفوظة"));
            subject.put("revision", manifest.optLong("revision", 0L));
            subject.put("lessons", lessonList);
            subjects.put(subject);
        }
        JSObject result = new JSObject();
        result.put("subjects", subjects);
        call.resolve(result);
    }

    @PluginMethod
    public void readLesson(PluginCall call) {
        String lessonId = call.getString("lessonId");
        if (lessonId == null || lessonId.trim().isEmpty() || lessonId.length() > 160) {
            call.reject("offline_lesson_invalid");
            return;
        }

        JSONObject state = readState();
        String ownerId = activeOwner(state);
        if (state == null || ownerId == null) {
            call.reject("offline_lesson_not_available");
            return;
        }

        JSArray components = new JSArray();
        String lessonTitle = "درس محفوظ";
        long totalBytes = 0L;
        JSONArray records = state.optJSONArray("packs");
        for (int recordIndex = 0; recordIndex < records.length(); recordIndex++) {
            JSONObject record = records.optJSONObject(recordIndex);
            if (record == null || !ownerId.equals(record.optString("ownerId", ""))) continue;
            if (!"ready".equals(record.optString("status", ""))) continue;
            JSONObject manifest = record.optJSONObject("manifest");
            JSONArray artifacts = manifest == null ? null : manifest.optJSONArray("artifacts");
            if (artifacts == null) continue;
            for (int artifactIndex = 0; artifactIndex < artifacts.length(); artifactIndex++) {
                JSONObject artifact = artifacts.optJSONObject(artifactIndex);
                if (artifact == null || !lessonId.equals(artifact.optString("lessonId", ""))) continue;
                if (!isTextKind(artifact.optString("kind", ""))) continue;
                byte[] bytes = verifiedArtifactBytes(ownerId, record, artifact);
                if (bytes == null) continue;
                totalBytes += bytes.length;
                if (totalBytes > MAX_LESSON_RESPONSE_BYTES) {
                    call.reject("offline_lesson_too_large");
                    return;
                }
                String body;
                try {
                    body = StandardCharsets.UTF_8
                        .newDecoder()
                        .onMalformedInput(CodingErrorAction.REPORT)
                        .onUnmappableCharacter(CodingErrorAction.REPORT)
                        .decode(ByteBuffer.wrap(bytes))
                        .toString();
                } catch (Exception ignored) {
                    continue;
                }
                lessonTitle = safeLabel(artifact, "lessonTitle", lessonTitle);
                JSObject component = new JSObject();
                component.put("artifactId", artifact.optString("artifactId", ""));
                component.put("title", safeLabel(artifact, "title", "مكوّن الدرس"));
                component.put("sourceType", sourceType(artifact));
                component.put("sortOrder", artifact.optInt("sortOrder", 0));
                component.put("body", body);
                components.put(component);
            }
        }
        if (components.length() == 0) {
            call.reject("offline_lesson_not_available");
            return;
        }
        JSObject result = new JSObject();
        result.put("lessonId", lessonId);
        result.put("title", lessonTitle);
        result.put("components", components);
        call.resolve(result);
    }

    private JSONObject verifiedAssessmentBundle(
        JSONObject state,
        String ownerId,
        String lessonId,
        String expectedKind
    ) {
        JSONArray records = state.optJSONArray("packs");
        for (int recordIndex = 0; recordIndex < records.length(); recordIndex++) {
            JSONObject record = records.optJSONObject(recordIndex);
            if (record == null || !ownerId.equals(record.optString("ownerId", ""))) continue;
            if (!"ready".equals(record.optString("status", ""))) continue;
            JSONObject manifest = record.optJSONObject("manifest");
            JSONArray artifacts = manifest == null ? null : manifest.optJSONArray("artifacts");
            if (artifacts == null) continue;
            for (int artifactIndex = 0; artifactIndex < artifacts.length(); artifactIndex++) {
                JSONObject artifact = artifacts.optJSONObject(artifactIndex);
                if (artifact == null || !lessonId.equals(artifact.optString("lessonId", ""))) continue;
                if (!expectedKind.equals(artifact.optString("kind", ""))) continue;
                byte[] bytes = verifiedArtifactBytes(ownerId, record, artifact);
                if (bytes == null) continue;
                try {
                    JSONObject bundle = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
                    if (bundle.optInt("schemaVersion", -1) != 1) continue;
                    if (!lessonId.equals(bundle.optString("lessonId", ""))) continue;
                    String expectedBundleKind = "assessment".equals(expectedKind)
                        ? "official-questions"
                        : "self-test";
                    if (!expectedBundleKind.equals(bundle.optString("kind", ""))) continue;
                    if (bundle.optJSONArray("questions") == null) continue;
                    return bundle;
                } catch (Exception ignored) {
                    // A malformed, hash-valid JSON body is still rejected.
                }
            }
        }
        return null;
    }

    private JSArray safeOptions(JSONArray options) {
        JSArray result = new JSArray();
        if (options == null) return result;
        for (int index = 0; index < options.length(); index++) {
            JSONObject option = options.optJSONObject(index);
            if (option == null) continue;
            String id = option.optString("id", "").trim();
            String text = option.optString("text", "").trim();
            if (id.isEmpty() || id.length() > 160 || text.isEmpty() || text.length() > 8000) continue;
            JSObject safe = new JSObject();
            safe.put("id", id);
            safe.put("text", text);
            safe.put("sortOrder", option.optInt("sortOrder", index));
            result.put(safe);
        }
        return result;
    }

    private JSONObject savedLearning(
        JSONObject state,
        String ownerId,
        String lessonId,
        String questionId,
        String bundleKind
    ) {
        JSONArray learning = state.optJSONArray("learning");
        if (learning == null) return null;
        String expectedKind = "official-questions".equals(bundleKind)
            ? "official-question-note"
            : "self-test-attempt";
        for (int index = learning.length() - 1; index >= 0; index--) {
            JSONObject record = learning.optJSONObject(index);
            if (
                record != null &&
                ownerId.equals(record.optString("ownerId", "")) &&
                lessonId.equals(record.optString("lessonId", "")) &&
                questionId.equals(record.optString("questionId", "")) &&
                expectedKind.equals(record.optString("kind", ""))
            ) return record;
        }
        return null;
    }

    private JSObject safeQuestion(JSONObject question, JSONObject saved) {
        if (question == null) return null;
        String questionId = question.optString("questionId", "").trim();
        String revisionId = question.optString("revisionId", "").trim();
        String text = question.optString("questionText", "").trim();
        if (questionId.isEmpty() || revisionId.isEmpty() || text.isEmpty()) return null;
        JSObject safe = new JSObject();
        safe.put("questionId", questionId);
        safe.put("revisionId", revisionId);
        safe.put("questionText", text);
        safe.put("questionType", safeLabel(question, "questionType", "QUESTION"));
        safe.put("sortOrder", question.optInt("sortOrder", 0));
        safe.put("options", safeOptions(question.optJSONArray("options")));
        safe.put(
            "savedAnswer",
            saved == null || saved.isNull("answerText")
                ? null
                : saved.optString("answerText", null)
        );
        safe.put(
            "selectedOptionId",
            saved == null || saved.isNull("selectedOptionId")
                ? null
                : saved.optString("selectedOptionId", null)
        );
        safe.put(
            "isCorrect",
            saved == null || saved.isNull("isCorrect")
                ? null
                : saved.optBoolean("isCorrect")
        );
        return safe;
    }

    @PluginMethod
    public void readLessonAssessments(PluginCall call) {
        String lessonId = call.getString("lessonId");
        if (lessonId == null || lessonId.trim().isEmpty() || lessonId.length() > 160) {
            call.reject("offline_lesson_invalid");
            return;
        }
        JSONObject state = readState();
        String ownerId = activeOwner(state);
        if (state == null || ownerId == null) {
            call.reject("offline_assessment_not_available");
            return;
        }
        JSArray official = new JSArray();
        JSArray selfTest = new JSArray();
        JSONObject officialBundle = verifiedAssessmentBundle(state, ownerId, lessonId, "assessment");
        JSONObject selfTestBundle = verifiedAssessmentBundle(state, ownerId, lessonId, "self-test");
        for (JSONObject bundle : new JSONObject[] { officialBundle, selfTestBundle }) {
            if (bundle == null) continue;
            JSONArray questions = bundle.optJSONArray("questions");
            JSArray target = "official-questions".equals(bundle.optString("kind", ""))
                ? official
                : selfTest;
            for (int index = 0; index < questions.length(); index++) {
                JSONObject question = questions.optJSONObject(index);
                JSObject safe = safeQuestion(
                    question,
                    question == null
                        ? null
                        : savedLearning(
                            state,
                            ownerId,
                            lessonId,
                            question.optString("questionId", ""),
                            bundle.optString("kind", "")
                        )
                );
                if (safe != null) target.put(safe);
            }
        }
        JSObject result = new JSObject();
        result.put("officialQuestions", official);
        result.put("selfTestQuestions", selfTest);
        call.resolve(result);
    }

    private JSONObject findQuestion(JSONObject bundle, String questionId, String revisionId) {
        if (bundle == null) return null;
        JSONArray questions = bundle.optJSONArray("questions");
        if (questions == null) return null;
        for (int index = 0; index < questions.length(); index++) {
            JSONObject question = questions.optJSONObject(index);
            if (
                question != null &&
                questionId.equals(question.optString("questionId", "")) &&
                revisionId.equals(question.optString("revisionId", ""))
            ) return question;
        }
        return null;
    }

    @PluginMethod
    public void revealOfficialAnswer(PluginCall call) {
        String lessonId = call.getString("lessonId");
        String questionId = call.getString("questionId");
        String revisionId = call.getString("revisionId");
        String attempt = call.getString("attempt");
        if (
            lessonId == null || questionId == null || revisionId == null || attempt == null ||
            attempt.trim().isEmpty() || lessonId.length() > 160 || questionId.length() > 160 ||
            revisionId.length() > 160 || attempt.length() > 64000
        ) {
            call.reject("offline_assessment_attempt_invalid");
            return;
        }
        JSONObject state = readState();
        String ownerId = activeOwner(state);
        if (state == null || ownerId == null) {
            call.reject("offline_assessment_not_available");
            return;
        }
        JSONObject question = findQuestion(
            verifiedAssessmentBundle(state, ownerId, lessonId, "assessment"),
            questionId,
            revisionId
        );
        if (question == null) {
            call.reject("offline_assessment_question_not_found");
            return;
        }
        String modelAnswer = question.optString("modelAnswer", "").trim();
        if (modelAnswer.isEmpty()) {
            call.reject("offline_assessment_answer_not_available");
            return;
        }
        try {
            persistOfficialAttempt(ownerId, lessonId, questionId, revisionId, attempt);
        } catch (Exception ignored) {
            call.reject("offline_assessment_save_failed");
            return;
        }
        JSObject result = new JSObject();
        result.put("modelAnswer", modelAnswer);
        result.put("explanation", question.isNull("explanation") ? null : question.optString("explanation", null));
        result.put(
            "correctOptionIds",
            question.optJSONArray("correctOptionIds") == null
                ? new JSArray()
                : question.optJSONArray("correctOptionIds")
        );
        call.resolve(result);
    }

    @PluginMethod
    public void checkSelfTestAnswer(PluginCall call) {
        String lessonId = call.getString("lessonId");
        String questionId = call.getString("questionId");
        String revisionId = call.getString("revisionId");
        String selectedOptionId = call.getString("selectedOptionId");
        if (
            lessonId == null || questionId == null || revisionId == null || selectedOptionId == null ||
            lessonId.length() > 160 || questionId.length() > 160 || revisionId.length() > 160 ||
            selectedOptionId.trim().isEmpty() || selectedOptionId.length() > 160
        ) {
            call.reject("offline_assessment_selection_invalid");
            return;
        }
        JSONObject state = readState();
        String ownerId = activeOwner(state);
        if (state == null || ownerId == null) {
            call.reject("offline_assessment_not_available");
            return;
        }
        JSONObject question = findQuestion(
            verifiedAssessmentBundle(state, ownerId, lessonId, "self-test"),
            questionId,
            revisionId
        );
        if (question == null) {
            call.reject("offline_assessment_question_not_found");
            return;
        }
        boolean optionExists = false;
        JSONArray options = question.optJSONArray("options");
        if (options == null) {
            call.reject("offline_assessment_option_not_found");
            return;
        }
        for (int index = 0; index < options.length(); index++) {
            JSONObject option = options.optJSONObject(index);
            if (option != null && selectedOptionId.equals(option.optString("id", ""))) {
                optionExists = true;
                break;
            }
        }
        if (!optionExists) {
            call.reject("offline_assessment_option_not_found");
            return;
        }
        String correctOptionId = question.optString("correctOptionId", "");
        boolean correct = selectedOptionId.equals(correctOptionId);
        int scorePercent;
        try {
            scorePercent = persistSelfTestAttempt(
                ownerId,
                lessonId,
                questionId,
                revisionId,
                selectedOptionId,
                correct
            );
        } catch (Exception ignored) {
            call.reject("offline_assessment_save_failed");
            return;
        }
        JSONObject feedback = question.optJSONObject("feedbackByOption");
        JSONObject selectedFeedback = feedback == null ? null : feedback.optJSONObject(selectedOptionId);
        String feedbackKey = correct ? "whyCorrect" : "whyWrong";
        JSObject result = new JSObject();
        result.put("isCorrect", correct);
        result.put("scorePercent", scorePercent);
        result.put("correctOptionId", correctOptionId);
        result.put("explanation", question.isNull("explanation") ? null : question.optString("explanation", null));
        result.put(
            "correction",
            selectedFeedback == null || selectedFeedback.isNull(feedbackKey)
                ? null
                : selectedFeedback.optString(feedbackKey, null)
        );
        call.resolve(result);
    }
}
