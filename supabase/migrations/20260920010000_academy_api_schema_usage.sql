-- Allow PostgREST roles to resolve explicitly granted academy RPCs.
-- Table access remains denied unless separately granted, and RLS stays enabled.
grant usage on schema academy to anon, authenticated, service_role;
