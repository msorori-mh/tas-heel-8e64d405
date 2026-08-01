CREATE POLICY "same logic, new name" ON "App"."Items"
FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);
