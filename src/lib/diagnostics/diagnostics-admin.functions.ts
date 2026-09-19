import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  DIAGNOSTIC_ISSUE_STATUSES,
  DIAGNOSTIC_WINDOWS,
  type DiagnosticIssueStatus,
  type DiagnosticWindow,
} from "./diagnostics-contract";

/**
 * Admin-only diagnostics reads. Every RPC below is SECURITY DEFINER and fails
 * closed for non full-admins, so authorization is enforced in the database.
 */

const windowSchema = z.enum(DIAGNOSTIC_WINDOWS);
const fingerprintSchema = z
  .string()
  .min(4)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);

export type DiagnosticsSummary = {
  window: DiagnosticWindow;
  total_events: number;
  affected_users: number;
  critical_events: number;
  new_issues: number;
  top_app_versions: Array<{ label: string; count: number }>;
  top_platforms: Array<{ label: string; count: number }>;
  top_routes: Array<{ label: string; count: number }>;
  timeline: Array<{ bucket: string; count: number }>;
};

export type DiagnosticsIssue = {
  fingerprint: string;
  severity: string;
  event_type: string;
  source: string;
  message: string;
  event_count: number;
  affected_users: number;
  first_seen: string;
  last_seen: string;
  app_version: string | null;
  platform: string | null;
  route: string | null;
  status: DiagnosticIssueStatus;
};

export type DiagnosticsEvent = {
  id: string;
  created_at: string;
  severity: string;
  source: string;
  event_type: string;
  message: string;
  stack: string | null;
  route: string | null;
  action: string | null;
  app_version: string | null;
  app_build: string | null;
  platform: string | null;
  os_version: string | null;
  device_model: string | null;
  network_type: string | null;
  online: boolean | null;
  session_id: string | null;
  metadata: Record<string, string | number | boolean> | null;
};

export const adminDiagnosticsOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { window: DiagnosticWindow }) =>
    z.object({ window: windowSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const [summary, issues] = await Promise.all([
      context.supabase.rpc("admin_diagnostics_summary", { _window: data.window }),
      context.supabase.rpc("admin_diagnostics_issues", { _window: data.window, _limit: 100 }),
    ]);
    if (summary.error) throw new Error("diagnostics_summary_failed");
    if (issues.error) throw new Error("diagnostics_issues_failed");
    return {
      summary: summary.data as unknown as DiagnosticsSummary,
      issues: (issues.data ?? []) as unknown as DiagnosticsIssue[],
    };
  });

export const adminDiagnosticsIssueDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fingerprint: string }) =>
    z.object({ fingerprint: fingerprintSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("admin_diagnostics_issue_detail", {
      _fingerprint: data.fingerprint,
      _limit: 20,
    });
    if (error) throw new Error("diagnostics_detail_failed");
    return { events: (rows ?? []) as unknown as DiagnosticsEvent[] };
  });

export const adminDiagnosticsSetStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fingerprint: string; status: DiagnosticIssueStatus }) =>
    z
      .object({ fingerprint: fingerprintSchema, status: z.enum(DIAGNOSTIC_ISSUE_STATUSES) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_diagnostics_set_issue_status", {
      _fingerprint: data.fingerprint,
      _status: data.status,
    });
    if (error) throw new Error("diagnostics_status_update_failed");
    return { ok: true as const };
  });
