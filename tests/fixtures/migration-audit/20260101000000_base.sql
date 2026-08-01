-- Minimal fixture, intentionally not copied from production.
CREATE TABLE "App"."Items" (
  "id" uuid PRIMARY KEY,
  "owner_id" uuid NOT NULL
);

CREATE OR REPLACE FUNCTION "App"."owns_item"(item_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = "App", pg_temp
AS $$ SELECT auth.uid() IS NOT NULL $$;

ALTER TABLE "App"."Items" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own"
ON "App"."Items"
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND "App"."owns_item"("id")
);
