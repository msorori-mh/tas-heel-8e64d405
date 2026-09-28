# Project technical decisions

- Published lab corrections create a new hash-pinned resource and an atomic audit link to the replaced resource; never rewrite the old published bytes, so concurrent corrections fail closed and history survives.
- Student resource reads use a restrictive database visibility gate backed by a security-definer lookup, with legacy privileged reads and artifact endpoints also excluding replaced lab resources; this prevents direct-link access after correction.