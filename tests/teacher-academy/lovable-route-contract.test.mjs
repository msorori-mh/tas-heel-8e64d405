import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

const [layout, indexRoute, verifyRoute, app, academySupabase, rootVite, standaloneEnv] =
  await Promise.all([
    read("src/routes/academy.tsx"),
    read("src/routes/academy.index.tsx"),
    read("src/routes/academy.verify.tsx"),
    read("apps/teacher-academy/src/App.tsx"),
    read("apps/teacher-academy/src/lib/supabase.ts"),
    read("vite.config.ts"),
    read("apps/teacher-academy/.env.example"),
  ]);

test("Lovable root build exposes the academy below an isolated client-only layout", () => {
  assert.match(layout, /createFileRoute\("\/academy"\)/);
  assert.match(layout, /ssr:\s*false/);
  assert.match(layout, /styles\.css\?url/);
  assert.match(layout, /component:\s*Outlet/);
  assert.match(indexRoute, /createFileRoute\("\/academy\/"\)/);
  assert.match(indexRoute, /TeacherAcademyApp/);
  assert.match(verifyRoute, /createFileRoute\("\/academy\/verify"\)/);
  assert.match(verifyRoute, /TeacherAcademyApp/);
});

test("academy navigation, auth callback, and certificate verification honor the base path", () => {
  assert.match(app, /VITE_ACADEMY_BASE_PATH/);
  assert.match(app, /href=\{academyUrl\(\)\}/);
  assert.match(app, /emailRedirectTo:\s*new URL\(academyUrl\(\)/);
  assert.match(app, /academyUrl\(\s*`\/verify\?code=/);
  assert.match(app, /window\.location\.pathname === academyUrl\("\/verify"\)/);
  assert.doesNotMatch(app, /href=\{`\/verify\?code=/);
});

test("only the verified Lovable root build opens the feature; standalone stays fail-closed", () => {
  assert.match(rootVite, /"import\.meta\.env\.VITE_ACADEMY_ENABLED": JSON\.stringify\("true"\)/);
  assert.match(
    rootVite,
    /"import\.meta\.env\.VITE_ACADEMY_BASE_PATH": JSON\.stringify\("\/academy"\)/,
  );
  assert.match(standaloneEnv, /^VITE_ACADEMY_ENABLED=false$/m);
  assert.match(standaloneEnv, /^VITE_ACADEMY_BASE_PATH=$/m);
});

test("Lovable root build reuses the existing public Supabase client configuration", () => {
  assert.match(academySupabase, /src\/integrations\/supabase\/public-config/);
  assert.match(academySupabase, /\|\| PUBLIC_SUPABASE_URL/);
  assert.match(academySupabase, /\|\| PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.doesNotMatch(academySupabase, /service.role|service_role/i);
});
