CREATE TABLE "Odd Schema"."Multi Line" (
  "Old Column" uuid PRIMARY KEY,
  payload text
);

ALTER TABLE "Odd Schema"."Multi Line"
  ADD COLUMN IF NOT EXISTS "Indexed Column" text;

ALTER TABLE "Odd Schema"."Multi Line"
  RENAME COLUMN "Indexed Column" TO "Renamed Column";

CREATE INDEX "Odd Schema"."multi_line_renamed_idx"
  ON "Odd Schema"."Multi Line" ("Renamed Column");

CREATE OR REPLACE FUNCTION public.overloaded(value uuid, flag boolean DEFAULT false)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $body$
BEGIN
  -- This DDL-shaped text must not become a top-level statement:
  PERFORM 'CREATE TABLE public.not_real(id uuid)';
  RETURN flag;
END;
$body$;

CREATE OR REPLACE FUNCTION public.overloaded(value text)
RETURNS boolean
LANGUAGE sql
AS $$ SELECT value <> 'DROP TABLE public.not_real' $$;

DO $block$
BEGIN
  EXECUTE format('ALTER TABLE %I ADD COLUMN %I text', 'dynamic_table', 'dynamic_column');
END;
$block$;
