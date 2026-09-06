# Roadmap

## In progress — MINISTERIAL_QUESTION_MEDIA_V1 (code only, no DB apply, no deploy)

- [x] Parser: XLSX or ZIP(XLSX + media/) with optional image columns; ZIP hardening (traversal, bombs, 8MB/50MB, PNG/JPEG/WebP magic bytes, SHA-256, unique names)
- [x] Migration file (not applied, `supabase/migrations-pending/20260914010000_ministerial_question_media.sql`): question-media storage policies, rendered_media on exam_session_questions, prepare/execute media validation + question_media insert, session pinning, state/result/reveal media exposure, admin list/update media, media access gate RPC
- [x] Client: content-addressed upload before execute; admin importer + questions manager (preview, replace/delete via new revision, locked when sessions exist)
- [x] Authenticated media endpoint (session ownership or content staff) → short signed URL, nosniff, private cache
- [x] Student session/result/reveal rendering (RTL, responsive, alt text)
- [ ] Tests: parser/ZIP security, static SQL/security, PG17 RPC rehearsal
- [ ] Verify: lint / typecheck / tests / build
- [ ] Runbook: bucket creation step (private `question-media`) before applying the migration

## Ready

- Offline cache for ministerial question images (IndexedDB, reuse lesson media cache pattern)
- Optional lightbox / pinch-zoom for question images on small screens
