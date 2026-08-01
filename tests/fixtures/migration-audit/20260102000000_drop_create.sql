DROP POLICY IF EXISTS "read own" ON "App"."Items";
CREATE POLICY "read own" ON "App"."Items"
FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS "items_owner_idx"
ON "App"."Items" ("owner_id");
