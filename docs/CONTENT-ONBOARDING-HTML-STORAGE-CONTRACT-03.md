# Operational Storage Bucket Contract for HTML Content (v0.5)

**Document ID:** `CONTENT-ONBOARDING-HTML-STORAGE-CONTRACT-03`
**Status:** DESIGN CONTRACT ONLY (ZERO Storage Buckets / Policies Applied)
**Target Storage Engine:** Supabase Storage
**Base Branch:** `origin/main`

---

## 1. Bucket Definitions & Storage Saga Flow

Both storage buckets in the Tas-heel platform are **PRIVATE** with zero public access. Direct client uploads to published storage are strictly prohibited.

```
+-----------------------------------------------------------------------------------+
| BUCKET: lesson-resource-drafts (PRIVATE)                                          |
| Staging Path: staging/{batch_id}/{resource_code}/v{version}/{filename}            |
| Access: Staff only via scoped signed upload/read URLs                             |
| Student Access: ABSOLUTELY DENIED                                                 |
| Write Boundary: Scoped signed upload URLs issued by Server for staging ONLY       |
+-----------------------------------------------------------------------------------+
                                         |
                                         | 1. Server verifies hash, size, manifest
                                         | 2. Server Edge Function (service_role) copy
                                         v
+-----------------------------------------------------------------------------------+
| BUCKET: lesson-resource-published (PRIVATE)                                       |
| Path: published/{subject_code}/{resource_code}/{content_hash}/{filename}          |
| Immutability: Hash-pinned content pathing (SHA-256)                               |
| Direct Browser Writes: STRICTLY PROHIBITED (Zero Client Write Access)             |
| Student Access: Short-lived Server-signed URLs (TTL max 15m)                      |
| Authorization Check: status = 'published' AND can_access_lesson(lesson_id)       |
+-----------------------------------------------------------------------------------+
```

---

## 2. Bucket Configurations & Storage Saga Steps

### 2.1 `lesson-resource-drafts` (Staging Storage)
- **Public Visibility:** `false` (PRIVATE).
- **Max Package Size:** 25MB (compressed `.zip` bundle), 10MB per extracted file.
- **Allowed MIME Types:**
  - `text/html`
  - `text/css`
  - `application/javascript`, `text/javascript`
  - `image/svg+xml`, `image/png`, `image/jpeg`, `image/webp`
  - `application/json`
- **Path Pattern:**
  `staging/{batch_id}/{resource_code}/v{version}/{filename}`
- **Security Guarantee:**
  - Draft bucket objects are unreadable by student tokens.
  - Staff (`admin`, `content_manager`) access draft files exclusively via short-lived scoped signed URLs (TTL max 15 minutes) issued by backend RPCs.

### 2.2 `lesson-resource-published` (Immutable Production Storage)
- **Public Visibility:** `false` (PRIVATE).
- **Max Package Size:** 100MB per uncompressed package.
- **Allowed MIME Types:** Identical to draft whitelist (sanitized during promotion).
- **Path Pattern (Immutable Hash-Pinned):**
  `published/{subject_code}/{resource_code}/{content_hash}/{filename}`
- **Security Guarantee:**
  - Direct browser upload or modification is impossible. Storage object RLS denies `INSERT`, `UPDATE`, and `DELETE` for all `anon` and `authenticated` JWTs. Only backend Edge Functions executing with `SUPABASE_SERVICE_ROLE_KEY` can populate or clean published storage.
  - Pathing is hash-pinned (`content_hash` = SHA-256 of package). Re-publishing creates a new directory, ensuring cached client assets never get overwritten in place.

---

## 3. End-to-End Storage Saga & Lifecycle Execution

```
[Client] ---> 1. create_import_batch() ---> [Server DB]
[Client] <--- 2. Staging Signed Upload URL <--- [Server]
[Client] ---> 3. Upload Zip to Staging Prefix ---> [lesson-resource-drafts]
[Server] ---> 4. finalize_uploaded_package() -> Verify hash, size, manifest, ownership
[Server] ---> 5. Extract & Validate package in Staging
[Admin]  ---> 6. approve_resource_version()
[Admin]  ---> 7. publish_resource_version() -> Server copies Staging files to Published bucket
                                               DB binds published_version_id
[Student]---> 8. fetch_published_lesson_resources() -> Server verifies authorization & issues short-lived signed URL
```

### Storage Operation Ledger & Reconciliation Saga
- **Operation Ledger (`storage_operations`)**: Tracks every file movement, verification, and promotion across 8 explicit states: `pending`, `uploaded`, `verified`, `promoted`, `cleanup_pending`, `cleaned`, `failed`, `compensated`.
- **Orphan Detection**: A background reconciliation job checks `storage_operations` for uncommitted staging prefixes or incomplete promotions older than 24 hours (e.g. aborted batch uploads or network disconnects).
- **Retry Policy & Compensation Contract**: Retries failed operations up to 3 times with exponential backoff. If promotion fails after DB Phase A commit, compensation marks `status = 'compensated'` and schedules staging artifacts for garbage collection.
- **Cleanup Ownership**: Cleanup is executed exclusively by a dedicated backend job using `service_role`.
- **No Partial Student Access**: Students are never granted access to staging or partial upload paths. Signed URLs are issued ONLY for fully verified files inside `published/{subject_code}/{resource_code}/{content_hash}/` corresponding to an active `published_version_id`.

---

## 4. Storage Row Level Security (RLS) Policies

### 4.1 Draft Bucket (`lesson-resource-drafts`)

```sql
-- 1. Deny Public / Student Access Entirely
-- Default fail-closed applies.

-- 2. Staff Upload Staging Policy
CREATE POLICY "Staff Staging Upload Draft Package"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'lesson-resource-drafts'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'content_manager')
  )
);

-- 3. Staff Read Draft Policy via Signed URL
CREATE POLICY "Staff Read Draft Package"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'lesson-resource-drafts'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'content_manager')
  )
);
```

### 4.2 Published Bucket (`lesson-resource-published`)

```sql
-- 1. Student Access Policy via Server-Signed URL Check
-- Direct browser queries to storage.objects yield zero rows.
-- Access is granted exclusively via Server RPC generating short-lived signed URLs.

-- 2. Direct Browser Write Prohibition
-- NO INSERT, UPDATE, or DELETE policies created for anon/authenticated roles.
-- File promotion is performed exclusively by Edge Function using SUPABASE_SERVICE_ROLE_KEY.
```

---

## 5. Content Security Policy (CSP) & Sandboxing

All HTML lesson assets rendered in an iframe must be served with strict CSP and iframe sandboxing headers:

```http
Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'none'; frame-ancestors 'self';
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
```

### Iframe Client Integration Standard
```html
<iframe
  src="https://tas-heel.app/api/resource-proxy?code=RES-BIO-10-MM01&token=..."
  sandbox="allow-scripts allow-same-origin"
  referrerpolicy="strict-origin-when-cross-origin"
></iframe>
```

---

## 6. Storage Integrity & Fail-Closed Rules

1. **Hash Verification**: Before promoting files from `lesson-resource-drafts` to `lesson-resource-published`, the server re-computes the SHA-256 hash of each file and compares it against `lesson_resource_files.content_sha256`. Any mismatch immediately aborts the publish pipeline.
2. **Atomic Rollback**: If publishing fails mid-transfer (e.g. storage write timeout), all partially written files in the target published directory are deleted, and the database status remains `approved` or `draft`.
3. **No Direct Browser Write**: Storage policies enforce that no student or content manager can upload files directly to `lesson-resource-published`.
4. **Preflight Package Security Scanner (No Answer / Explanation Leakage)**: Staged packages are scanned prior to promotion. Packages containing forbidden fields (`correct_index`, `correct_answer`, `answer_key`, `hashed_answer`, `explanation`, `answer_explanation`, `correct_explanation`, `solution_key`) in HTML, JSON, JavaScript, manifests, inline scripts, or local assets are REJECTED. Student iframe payloads must be completely free of explanations and hidden answer keys. Post-reveal explanations are served strictly outside the package via server/application paths.
