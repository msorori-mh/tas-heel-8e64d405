# Operational Storage Bucket Contract for HTML Content (v0.3)

**Document ID:** `CONTENT-ONBOARDING-HTML-STORAGE-CONTRACT-03`  
**Status:** DESIGN CONTRACT ONLY (ZERO Storage Buckets / Policies Applied)  
**Target Storage Engine:** Supabase Storage  
**Base Branch:** `origin/main`

---

## 1. Bucket Definitions & Boundaries

```
+-----------------------------------------------------------------------------------+
| BUCKET: lesson-resource-drafts                                                    |
| Visibility: PRIVATE                                                               |
| Path: drafts/{batch_id}/{resource_code}/v{version}/{filename}                     |
| Allowed Roles: admin, content_manager (upload/read), reviewer (signed url read)  |
| Student Access: ABSOLUTELY DENIED                                                 |
| Write Boundary: Direct browser upload allowed ONLY for authenticated staff        |
+-----------------------------------------------------------------------------------+
                                        |
                                        | (Publish RPC / Edge Function service_role)
                                        v
+-----------------------------------------------------------------------------------+
| BUCKET: lesson-resource-published                                                 |
| Visibility: READ-ONLY (Authenticated Student + Active Subscription)               |
| Path: published/{subject_code}/{resource_code}/{content_hash}/{filename}          |
| Immutability: Hash-pinned content pathing (SHA-256)                               |
| Direct Browser Writes: STRICTLY PROHIBITED (Zero Client Write Access)             |
| Population Mechanism: Atomically copied by Edge Function during publish action    |
+-----------------------------------------------------------------------------------+
```

---

## 2. Bucket Configurations

### 2.1 `lesson-resource-drafts`
- **Public Visibility:** `false` (Private).
- **Max Package Size:** 25MB (compressed `.zip` bundle), 10MB per extracted file.
- **Allowed MIME Types:**
  - `text/html`
  - `text/css`
  - `application/javascript`, `text/javascript`
  - `image/svg+xml`, `image/png`, `image/jpeg`, `image/webp`
  - `application/json`
- **Path Pattern:**
  `drafts/{batch_id}/{resource_code}/v{version}/{filename}`
- **Security Guarantee:**
  Draft bucket objects are unreadable by student tokens. Reviewers access draft content exclusively via short-lived signed URLs (TTL max 15 minutes).

### 2.2 `lesson-resource-published`
- **Public Visibility:** `false` (Protected Student Read).
- **Max Package Size:** 100MB per uncompressed package.
- **Allowed MIME Types:** Identical to drafts whitelist (sanitized during promotion).
- **Path Pattern (Immutable Hash-Pinned):**
  `published/{subject_code}/{resource_code}/{content_hash}/{filename}`
- **Security Guarantee:**
  - Direct browser upload or modification is impossible. Storage object RLS denies `INSERT`, `UPDATE`, `DELETE` for all `anon` and `authenticated` JWTs. Only `service_role` can populate or delete published files.
  - Pathing is hash-pinned (`content_hash` = SHA-256 of package). Re-publishing creates a new directory, ensuring cached client assets never get overwritten in place.

---

## 3. Storage Row Level Security (RLS) Policies

### 3.1 Draft Bucket (`lesson-resource-drafts`)

```sql
-- 1. Deny Public / Student Access Entirely
-- Default fail-closed applies.

-- 2. Staff Upload Policy
CREATE POLICY "Staff Upload Draft Package"
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

-- 3. Staff Read Draft Policy
CREATE POLICY "Staff Read Draft Package"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'lesson-resource-drafts'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'content_manager')
    OR public.has_role(auth.uid(), 'reviewer')
  )
);
```

### 3.2 Published Bucket (`lesson-resource-published`)

```sql
-- 1. Student Read Policy (Published Only + Active Subscription/Lesson Access)
CREATE POLICY "Student Read Published Resources"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'lesson-resource-published'
  AND EXISTS (
    SELECT 1 FROM public.lesson_resources lr
    JOIN public.lesson_resource_versions lrv ON lrv.resource_id = lr.id
    WHERE lr.status = 'published'
      AND lrv.storage_path LIKE (storage.objects.name || '%')
      AND public.can_access_lesson(lr.lesson_id)
  )
);

-- 2. Direct Browser Write Prohibition
-- NO INSERT, UPDATE, or DELETE policies created for anon/authenticated roles.
-- Writes performed exclusively by Edge Function using SUPABASE_SERVICE_ROLE_KEY.
```

---

## 4. Content Security Policy (CSP) & Sandboxing

All HTML lesson assets rendered in an iframe must be served with strict CSP and iframe sandboxing headers:

```http
Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'none'; frame-ancestors 'self';
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
```

### Iframe Client Integration Standard
```html
<iframe
  src="/api/html-preview?resource=RES-BIO-10-MM01&token=..."
  sandbox="allow-scripts allow-same-origin"
  referrerpolicy="strict-origin-when-cross-origin"
></iframe>
```

---

## 5. Storage Integrity & Fail-Closed Rules

1. **Hash Verification**: Before promoting files from `lesson-resource-drafts` to `lesson-resource-published`, the server re-computes the SHA-256 hash of each file and compares it against `lesson_resource_files.content_sha256`. Any mismatch immediately aborts the publish pipeline.
2. **Atomic Rollback**: If publishing fails mid-transfer (e.g. storage write timeout), all partially written files in the target published directory are deleted, and the database status remains `approved` or `draft`.
3. **No Direct Browser Write**: Storage policies enforce that no student or content manager can upload files directly to `lesson-resource-published`.

