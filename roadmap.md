# Roadmap

## Done — MINISTERIAL_QUESTION_MEDIA_V1 (code only, no DB apply, no deploy)

- [x] Parser: XLSX or ZIP(XLSX + media/) with optional image columns; ZIP hardening (traversal, bombs, 8MB/50MB, PNG/JPEG/WebP magic bytes, SHA-256, unique names)
- [x] Migration file (NOT applied, `supabase/migrations-pending/20260914010000_ministerial_question_media.sql`): question-media storage policies, rendered_media on exam_session_questions, prepare/execute media validation + question_media insert, session pinning, state/result/reveal media exposure, admin list/update media, media access gate RPC
- [x] Client: content-addressed upload before execute; admin importer + questions manager (preview, replace/delete via new revision, locked when sessions exist)
- [x] Authenticated media endpoint (session ownership or content staff) → short signed URL, nosniff, private cache
- [x] Student session/result/reveal rendering (RTL, responsive, alt text)
- [x] Tests: parser/ZIP security (24), static SQL/security (13), PG17 RPC rehearsal (92 assertions) + CI job
- [x] Verify: typecheck / lint (touched files) / `npm test` 302 / vitest 419 / `vite build`

## Ready

- Production apply (separate, explicit approval): create PRIVATE bucket `question-media` first, then apply the pending migration, then re-run the v1 + media PG17 rehearsals against a fresh clone
- Offline cache for ministerial question images (IndexedDB, reuse lesson media cache pattern)
- Optional lightbox / pinch-zoom for question images on small screens
- Repo-wide `prettier --write` pass: 26 pre-existing files fail `eslint .` on formatting only (outside this task's scope)
