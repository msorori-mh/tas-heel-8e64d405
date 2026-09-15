# S3.1 — Local Android release shell

Status: **code/static tests PASS; APK/device gate HOLD**

Capacitor no longer embeds the production website as its default application
URL. Without development variables, Android loads `mobile/www/index.html` from
the installed package. Remote live reload requires an explicit flag and an HTTPS
private-network origin; public hosts, HTTP, credentials, and fragments fail
closed.

The bundled page is the existing verified-content cold-start entry, not yet the
complete student application. Therefore this stage must not be merged into a
release until an APK is installed on a physical device and the online-to-offline
journey is proven after force-stop and airplane mode.

Full Offline-first additionally requires encrypted SQLite, transactional
migrations, durable outbox/sync, conflict resolution, account isolation, and
multi-day reconnect tests. Production and the current Play release remain
unchanged.

Capacitor synchronization passed and the copied Android assets matched their
sources by SHA-256. The local APK build remains blocked before compilation
because Gradle 8.14.3 is not cached and this execution environment cannot reach
`services.gradle.org`; GitHub Android CI is therefore the authoritative build
gate for this draft.
