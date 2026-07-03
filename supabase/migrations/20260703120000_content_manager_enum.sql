-- CONTENT-MANAGER-RBAC: enum value only (must commit before policies migration)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'content_manager';
