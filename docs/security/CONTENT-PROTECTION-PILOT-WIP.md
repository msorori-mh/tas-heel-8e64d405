# CP-01 checkpoint — HOLD, not integrated

User authorized a bounded Android content-protection pilot. Work started from review baseline ed6a57c85f17a603c8ede4a120043704a4a082d4, then the user reported the normal offline app journey was still failing. That repair has priority in PR #292 and is isolated from this branch.

This checkpoint contains draft Java classes only: AES-GCM envelope, AndroidKeyStore/private no-backup storage, and a manifest/active-owner-constrained Capacitor bridge. These classes are NOT registered or connected to the existing artifact cache. They are NOT included in the offline-repair review package. No protection is claimed as deployed or verified.

Pending before use: JVM cryptographic negative tests; AndroidKeyStore and migration tests; TypeScript cache integration; compatibility with the native fallback reader; minSdk I/O compatibility; concurrent account changes and process death; interruption/disk-full recovery; preservation of outbox/progress; ciphertext-copy/key-loss checks; browser/native delivery threat assessment. Server-issued device licenses, attestation, screenshot policy, watermarking and rights contracts are separate work, not implemented by this checkpoint.

Do not merge this branch into production or include these classes in a public release before the stage acceptance tests pass. Resume after the normal offline journey is established.

Local JVM evidence: 36 checks passed with Java 17 (`java com.sun.tools.javac.Main` then `ContentEnvelopeCheck`). Covers exact Arabic question/map/lab round-trip, fresh randomized IVs, wrong device key, owner/artifact/path substitution, header/IV/tag corruption, truncation and plaintext hash mismatch. AndroidKeyStore, bridge integration and physical-device acceptance remain HOLD.
