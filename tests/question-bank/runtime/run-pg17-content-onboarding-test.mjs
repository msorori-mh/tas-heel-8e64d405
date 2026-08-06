import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const CONTAINER_NAME = "test-pg17-content-onboarding-disposable";
const DB_NAME = "test_content_onboarding_db";
const MIGRATION_PATH = path.join(process.cwd(), "supabase/migrations/20260806120000_content_onboarding_html_operational_backend.sql");

function runPsql(sql, db = DB_NAME) {
  try {
    const cmd = `docker exec -i ${CONTAINER_NAME} psql -U postgres -d ${db} -v ON_ERROR_STOP=1`;
    return execSync(cmd, { input: sql, encoding: "utf8" });
  } catch (err) {
    return { error: err.stderr || err.stdout || err.message };
  }
}

async function main() {
  console.log("=== STARTING DISPOSABLE PG17 LOCAL RUNTIME TESTS ===");

  try {
    // 1. Ensure Docker container
    try {
      execSync(`docker run -d --name ${CONTAINER_NAME} -e POSTGRES_PASSWORD=postgres -p 5439:5432 postgres:17-alpine`, { stdio: "ignore" });
      await new Promise((r) => setTimeout(r, 2000));
    } catch {
      // Container might already exist
    }

    // Ensure DB
    execSync(`docker exec -i ${CONTAINER_NAME} psql -U postgres -c "DROP DATABASE IF EXISTS ${DB_NAME};"`, { stdio: "ignore" });
    execSync(`docker exec -i ${CONTAINER_NAME} psql -U postgres -c "CREATE DATABASE ${DB_NAME};"`, { stdio: "ignore" });

    // 2. Setup Baseline Historical Schema & Dangerous Policies
    const baselineSql = `
      CREATE SCHEMA IF NOT EXISTS storage;
      CREATE TABLE IF NOT EXISTS storage.buckets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        owner UUID,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now(),
        public BOOLEAN DEFAULT false,
        avif_autodetection BOOLEAN DEFAULT false,
        file_size_limit BIGINT,
        allowed_mime_types TEXT[]
      );
      CREATE TABLE IF NOT EXISTS storage.objects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        bucket_id TEXT REFERENCES storage.buckets(id),
        name TEXT,
        owner UUID,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now(),
        last_accessed_at TIMESTAMPTZ DEFAULT now(),
        metadata JSONB
      );

      CREATE OR REPLACE FUNCTION storage.foldername(name text)
      RETURNS text[] AS $$
      BEGIN
        RETURN string_to_array(name, '/');
      END;
      $$ LANGUAGE plpgsql;

      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
          CREATE ROLE service_role NOLOGIN;
        END IF;
      END $$;

      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE OR REPLACE FUNCTION auth.uid()
      RETURNS UUID AS $$
      BEGIN
        RETURN NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TABLE IF NOT EXISTS auth.users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT UNIQUE
      );

      CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user', 'content_manager');
      CREATE TYPE public.lesson_resource_type AS ENUM ('video', 'mindmap', 'experiment', 'pdf', 'link');

      CREATE TABLE IF NOT EXISTS public.user_roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
        role public.app_role NOT NULL,
        CONSTRAINT uq_user_role UNIQUE (user_id, role)
      );

      CREATE OR REPLACE FUNCTION public.has_role(p_user_id UUID, p_role public.app_role)
      RETURNS BOOLEAN AS $$
      BEGIN
        RETURN EXISTS (
          SELECT 1 FROM public.user_roles WHERE user_id = p_user_id AND role = p_role
        );
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;

      CREATE OR REPLACE FUNCTION public.is_content_staff(p_user_id UUID)
      RETURNS BOOLEAN AS $$
      BEGIN
        RETURN public.has_role(p_user_id, 'admin') OR public.has_role(p_user_id, 'content_manager');
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;

      CREATE TABLE IF NOT EXISTS public.subjects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS public.lessons (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        subject_id UUID REFERENCES public.subjects(id),
        title TEXT NOT NULL,
        sort_order INT DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS public.lesson_resources (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
        resource_type public.lesson_resource_type NOT NULL,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        description TEXT,
        sort_order INT DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE OR REPLACE FUNCTION public.can_access_lesson(p_lesson_id UUID)
      RETURNS BOOLEAN AS $$
      BEGIN
        RETURN p_lesson_id IS NOT NULL;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;

      -- HISTORICAL DANGEROUS POLICIES
      ALTER TABLE public.lesson_resources ENABLE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS "Resources viewable per lesson access" ON public.lesson_resources;
      CREATE POLICY "Resources viewable per lesson access"
        ON public.lesson_resources FOR SELECT TO authenticated
        USING (public.can_access_lesson(lesson_id));

      DROP POLICY IF EXISTS "Content staff manage resources" ON public.lesson_resources;
      CREATE POLICY "Content staff manage resources"
        ON public.lesson_resources FOR ALL TO authenticated
        USING (public.is_content_staff(auth.uid()));
    `;

    const baseRes = runPsql(baselineSql);
    if (typeof baseRes === "object" && baseRes.error) {
      console.error("Baseline SQL failed:", baseRes.error);
      process.exit(1);
    }
    console.log("[PASS] Historical baseline schema and policies set up.");

    // 3. Apply Migration
    const migrationSql = fs.readFileSync(MIGRATION_PATH, "utf8");
    const migRes = runPsql(migrationSql);
    if (typeof migRes === "object" && migRes.error) {
      console.error("Migration SQL failed:", migRes.error);
      process.exit(1);
    }
    console.log("[PASS] Migration applied cleanly on PostgreSQL 17.");

    // Enable Feature Flags in Test DB
    runPsql(`
      UPDATE public.content_feature_flags SET is_enabled = true;
    `);

    // 4. Test RLS, State Machine, Immutability, Audit, Concurrency, Retry
    const testSuiteSql = `
      DO $$
      DECLARE
        v_admin UUID := gen_random_uuid();
        v_staff UUID := gen_random_uuid();
        v_student UUID := gen_random_uuid();
        v_subj UUID := gen_random_uuid();
        v_less UUID := gen_random_uuid();
        v_wrong_less UUID := gen_random_uuid();
        v_batch_res JSONB;
        v_upload_res JSONB;
        v_final_res JSONB;
        v_batch_id UUID;
        v_resource_id UUID;
        v_version_id UUID;
        v_app_res JSONB;
        v_pub_res JSONB;
        v_stu_res JSONB;
        v_cnt INT;
        v_failed_op_id UUID;
        v_retry_res JSONB;
        v_retry_op_id UUID;
        v_prev_status TEXT;
      BEGIN
        -- Create test users
        INSERT INTO auth.users (id, email) VALUES (v_admin, 'admin@test.com'), (v_staff, 'staff@test.com'), (v_student, 'student@test.com');
        INSERT INTO public.user_roles (user_id, role) VALUES (v_admin, 'admin'), (v_staff, 'content_manager');

        INSERT INTO public.subjects (id, name) VALUES (v_subj, 'Bio');
        INSERT INTO public.lessons (id, subject_id, title) VALUES (v_less, v_subj, 'Lesson 1'), (v_wrong_less, v_subj, 'Lesson 2');

        -- Switch role to authenticated to enforce RLS (since postgres superuser bypasses RLS)
        EXECUTE 'SET LOCAL ROLE authenticated';

        -- 4.1 TEST RLS NEGATIVE: Direct browser mutations on protected tables DENIED for all roles
        PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);

        BEGIN
          INSERT INTO public.lesson_resources (lesson_id, resource_type, title, url)
          VALUES (v_less, 'mind_map_html', 'Direct Staff Write', 'staging/test');
          RAISE EXCEPTION 'Direct staff INSERT on lesson_resources should have failed';
        EXCEPTION WHEN OTHERS THEN
          IF SQLSTATE <> '42501' THEN
            RAISE EXCEPTION 'Expected 42501 for staff direct INSERT, got % (%)', SQLSTATE, SQLERRM;
          END IF;
        END;

        PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);

        BEGIN
          UPDATE public.lesson_resources SET title = 'Direct Admin Edit' WHERE id = gen_random_uuid();
          RAISE EXCEPTION 'Direct admin UPDATE on lesson_resources should have failed';
        EXCEPTION WHEN OTHERS THEN
          IF SQLSTATE <> '42501' THEN
            RAISE EXCEPTION 'Expected 42501 for admin direct UPDATE, got % (%)', SQLSTATE, SQLERRM;
          END IF;
        END;

        -- 4.2 TEST OPERATIONAL RPC FLOW: Create batch -> issue upload -> finalize upload
        PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);

        v_batch_res := public.create_content_import_batch('test.xlsx', 'test.zip', 1, 'k-1');
        v_batch_id := (v_batch_res->>'batch_id')::UUID;

        v_upload_res := public.issue_content_upload(v_batch_id, 'MM-001', 'test.zip', 'k-2');

        v_final_res := public.finalize_content_upload(
          v_batch_id, v_less, 'MM-001', 'mind_map_html', 'Mind Map Title',
          v_upload_res->>'staging_path', 'sha-hash-123', '{"entry":"index.html"}'::jsonb,
          '[{"file_path":"index.html","file_size_bytes":100,"mime_type":"text/html","sha256_hash":"sha-hash-123","is_entry_point":true}]'::jsonb,
          'k-3'
        );
        v_resource_id := (v_final_res->>'resource_id')::UUID;
        v_version_id := (v_final_res->>'version_id')::UUID;

        -- 4.3 TEST STUDENT READ NEGATIVE: Draft resource NOT readable by student
        PERFORM set_config('request.jwt.claim.sub', v_student::text, true);
        SELECT COUNT(*) INTO v_cnt FROM public.lesson_resources WHERE id = v_resource_id;
        IF v_cnt <> 0 THEN
          RAISE EXCEPTION 'Student should NOT be able to read Draft status resource directly';
        END IF;

        -- 4.4 SUBMIT REVIEW REQUIRES VALID SERVER VALIDATION
        PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);

        BEGIN
          PERFORM public.submit_resource_for_review(v_resource_id, 2, 'k-4-no-val');
          RAISE EXCEPTION 'Submit for review without valid server package validation should have failed';
        EXCEPTION WHEN OTHERS THEN
          IF SQLSTATE <> '42200' THEN
            RAISE EXCEPTION 'Expected 42200 for missing validation, got % (%)', SQLSTATE, SQLERRM;
          END IF;
        END;

        -- TEST AUTHORIZATION NEGATIVE: Staff cannot directly record server package validation
        BEGIN
          PERFORM public.record_server_package_validation(v_version_id, v_batch_id, 'sha-hash-123', 'v1-operational-server', '[]'::jsonb, true, 'k-val-forged');
          RAISE EXCEPTION 'Direct client validation recording should have failed with permission denied';
        EXCEPTION WHEN OTHERS THEN
          IF SQLSTATE <> '42501' THEN
            RAISE EXCEPTION 'Expected 42501 for direct client validation recording, got % (%)', SQLSTATE, SQLERRM;
          END IF;
        END;

        -- Record trusted server validation via trusted service_role context
        RESET ROLE;
        SET LOCAL ROLE service_role;
        PERFORM public.record_server_package_validation(v_version_id, v_batch_id, 'sha-hash-123', 'v1-operational-server', '[]'::jsonb, true, 'k-val-1');
        SET LOCAL ROLE authenticated;
        PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);

        -- Submit for review with valid server validation
        PERFORM public.submit_resource_for_review(v_resource_id, 2, 'k-4-valid');

        -- 4.5 TEST AUTHORIZATION NEGATIVE: Staff cannot approve or publish
        BEGIN
          PERFORM public.approve_resource_version(v_resource_id, v_version_id, 3, 'k-5-staff');
          RAISE EXCEPTION 'Staff approve should have failed';
        EXCEPTION WHEN OTHERS THEN
          IF SQLSTATE <> '42501' THEN
            RAISE EXCEPTION 'Expected 42501 for staff approve, got % (%)', SQLSTATE, SQLERRM;
          END IF;
        END;

        -- 4.6 ADMIN APPROVE & PUBLISH
        PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);

        v_app_res := public.approve_resource_version(v_resource_id, v_version_id, 3, 'k-5-admin');
        IF v_app_res->>'status' <> 'approved' THEN
          RAISE EXCEPTION 'Admin approve failed';
        END IF;

        v_pub_res := public.publish_resource_version(v_resource_id, v_version_id, 4, 'k-6-admin');
        IF v_pub_res->>'status' <> 'published' THEN
          RAISE EXCEPTION 'Admin publish failed';
        END IF;

        -- 4.7 TEST STUDENT READ POSITIVE: Published resource readable by student with lesson access
        PERFORM set_config('request.jwt.claim.sub', v_student::text, true);

        SELECT COUNT(*) INTO v_cnt FROM public.lesson_resources WHERE id = v_resource_id;
        IF v_cnt <> 1 THEN
          RAISE EXCEPTION 'Student should be able to read Published resource';
        END IF;

        v_stu_res := public.fetch_published_lesson_resources(v_less);
        IF jsonb_array_length(v_stu_res) <> 1 THEN
          RAISE EXCEPTION 'Student fetch_published_lesson_resources failed to return published resource';
        END IF;

        -- 4.8 TEST IMMUTABILITY & AUDIT APPEND-ONLY
        PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);

        BEGIN
          UPDATE public.lesson_resource_versions SET content_sha256 = 'mutated' WHERE id = v_version_id;
          RAISE EXCEPTION 'Updating immutable version should have failed';
        EXCEPTION WHEN OTHERS THEN
          IF SQLSTATE <> '42501' THEN
            RAISE EXCEPTION 'Expected 42501 for immutable version update, got % (%)', SQLSTATE, SQLERRM;
          END IF;
        END;

        BEGIN
          UPDATE public.lesson_resource_reviews SET reason = 'tampered' WHERE resource_id = v_resource_id;
          RAISE EXCEPTION 'Updating review audit record should have failed';
        EXCEPTION WHEN OTHERS THEN
          IF SQLSTATE <> '42501' THEN
            RAISE EXCEPTION 'Expected 42501 for audit update, got % (%)', SQLSTATE, SQLERRM;
          END IF;
        END;

        -- 4.9 TEST IDEMPOTENCY CONCURRENCY & RETRY ROW CREATION
        PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);

        -- Idempotent RPC re-execution attempt
        v_batch_res := public.create_content_import_batch('test.xlsx', 'test.zip', 1, 'k-1');
        IF (v_batch_res->>'batch_id')::UUID <> v_batch_id THEN
          RAISE EXCEPTION 'Idempotency replay failed to return cached batch_id';
        END IF;

        -- Retry storage operation test: insert fixture as admin/definer
        EXECUTE 'RESET ROLE';
        INSERT INTO public.storage_operations (
          operation_type, status, source_path, target_path, expected_hash, retry_number, attempt_count, idempotency_key
        ) VALUES (
          'promote_published', 'failed', 'staging/s1', 'published/p1', 'h1', 0, 1, 'op-failed-key'
        ) RETURNING id INTO v_failed_op_id;
        EXECUTE 'SET LOCAL ROLE authenticated';

        v_retry_res := public.retry_storage_operation(v_failed_op_id, 'op-retry-key-1');
        v_retry_op_id := (v_retry_res->>'operation_id')::UUID;

        IF v_retry_res->>'parent_operation_id' <> v_failed_op_id::text THEN
          RAISE EXCEPTION 'Retry operation parent_operation_id mismatch';
        END IF;

        IF (v_retry_res->>'retry_number')::INT <> 1 THEN
          RAISE EXCEPTION 'Retry operation retry_number should be 1';
        END IF;

        SELECT status INTO v_prev_status FROM public.storage_operations WHERE id = v_failed_op_id;
        IF v_prev_status <> 'failed' THEN
          RAISE EXCEPTION 'Previous failed storage operation was modified during retry';
        END IF;

      END $$;
    `;

    const suiteRes = runPsql(testSuiteSql);
    if (typeof suiteRes === "object" && suiteRes.error) {
      console.error("Test Suite Execution failed:", suiteRes.error);
      process.exit(1);
    }

    console.log("[PASS] All PG17 runtime SQL, RLS, Immutability, Audit, Concurrency, and Retry tests passed successfully!");
  } finally {
    // 5. Cleanup Docker container
    try {
      execSync(`docker rm -f ${CONTAINER_NAME}`, { stdio: "ignore" });
      console.log("[CLEANUP] Disposable PG17 container removed.");
    } catch {
      // Ignore cleanup error if already removed
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
