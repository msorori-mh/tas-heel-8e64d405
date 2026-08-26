import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createHtmlWorkflowAdapter } from "@/lib/server/html-pipeline/html-workflow-adapter";

interface RpcCall {
  fn: string;
  args: Record<string, unknown>;
}

function createMockSupabaseClient(): SupabaseClient<Database> & {
  rpcCalls: RpcCall[];
  fromCalls: string[];
} {
  const rpcCalls: RpcCall[] = [];
  const fromCalls: string[] = [];

  const client = {
    rpc: (fn: string, args?: Record<string, unknown>) => {
      rpcCalls.push({ fn, args: args ?? {} });
      if (fn === "is_content_feature_enabled") {
        return Promise.resolve({ data: true, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    from: (table: string) => {
      fromCalls.push(table);
      return {
        select: (_columns?: string) => ({
          eq: (_column: string, _value: unknown) => ({
            single: () =>
              Promise.resolve({
                data: { lifecycle_status: "draft" },
                error: null,
              }),
            in: (_column: string, _values: unknown[]) => Promise.resolve({ data: [], error: null }),
          }),
          in: (_column: string, _values: unknown[]) => Promise.resolve({ data: [], error: null }),
        }),
        insert: (_values: unknown) => ({
          select: (_columns?: string) => ({
            single: () =>
              Promise.resolve({
                data: { id: "00000000-0000-0000-0000-000000000001" },
                error: null,
              }),
          }),
        }),
        update: (_values: unknown) => ({
          eq: (_column: string, _value: unknown) => {
            const chain = {
              eq: (_column2: string, _value2: unknown) =>
                Promise.resolve({ error: null, data: null }),
            };
            return chain as unknown as Promise<{ error: null; data: null }>;
          },
        }),
      };
    },
  } as unknown as SupabaseClient<Database> & {
    rpcCalls: RpcCall[];
    fromCalls: string[];
  };

  client.rpcCalls = rpcCalls;
  client.fromCalls = fromCalls;
  return client;
}

describe("HtmlWorkflowAdapter — lifecycle RPC delegation", () => {
  test("submitResourceForReview calls submit_resource_for_review RPC", async () => {
    const mockClient = createMockSupabaseClient();
    const adapter = createHtmlWorkflowAdapter(mockClient);

    await adapter.submitResourceForReview("res-1", 5);

    const call = mockClient.rpcCalls.find((c) => c.fn === "submit_resource_for_review");
    assert.ok(call, "submit_resource_for_review RPC must be called");
    assert.equal(call.args.p_resource_id, "res-1");
    assert.equal(call.args.p_expected_lock_version, 5);
  });

  test("approveResource calls approve_resource RPC", async () => {
    const mockClient = createMockSupabaseClient();
    const adapter = createHtmlWorkflowAdapter(mockClient);

    await adapter.approveResource("res-1", "ver-1", 7);

    const call = mockClient.rpcCalls.find((c) => c.fn === "approve_resource");
    assert.ok(call, "approve_resource RPC must be called");
    assert.equal(call.args.p_resource_id, "res-1");
    assert.equal(call.args.p_version_id, "ver-1");
    assert.equal(call.args.p_expected_lock_version, 7);
  });

  test("rejectResource throws when reason is empty", async () => {
    const mockClient = createMockSupabaseClient();
    const adapter = createHtmlWorkflowAdapter(mockClient);

    await assert.rejects(
      async () => adapter.rejectResource("res-1", "ver-1", "admin-1", "   ", 3),
      /سبب الرفض مطلوب/,
    );

    const call = mockClient.rpcCalls.find((c) => c.fn === "reject_resource");
    assert.equal(call, undefined, "reject_resource RPC must not be called with empty reason");
  });

  test("rejectResource calls reject_resource RPC with trimmed reason", async () => {
    const mockClient = createMockSupabaseClient();
    const adapter = createHtmlWorkflowAdapter(mockClient);

    await adapter.rejectResource("res-1", "ver-1", "admin-1", "quality issue", 3);

    const call = mockClient.rpcCalls.find((c) => c.fn === "reject_resource");
    assert.ok(call, "reject_resource RPC must be called");
    assert.equal(call.args.p_resource_id, "res-1");
    assert.equal(call.args.p_version_id, "ver-1");
    assert.equal(call.args.p_reason, "quality issue");
    assert.equal(call.args.p_expected_lock_version, 3);
  });

  test("unpublishResource calls unpublish_resource RPC", async () => {
    const mockClient = createMockSupabaseClient();
    const adapter = createHtmlWorkflowAdapter(mockClient);

    await adapter.unpublishResource("res-1", 9);

    const call = mockClient.rpcCalls.find((c) => c.fn === "unpublish_resource");
    assert.ok(call, "unpublish_resource RPC must be called");
    assert.equal(call.args.p_resource_id, "res-1");
    assert.equal(call.args.p_expected_lock_version, 9);
  });

  test("rollbackResource calls rollback_resource RPC", async () => {
    const mockClient = createMockSupabaseClient();
    const adapter = createHtmlWorkflowAdapter(mockClient);

    await adapter.rollbackResource("res-1", "ver-target", 11);

    const call = mockClient.rpcCalls.find((c) => c.fn === "rollback_resource");
    assert.ok(call, "rollback_resource RPC must be called");
    assert.equal(call.args.p_resource_id, "res-1");
    assert.equal(call.args.p_target_version_id, "ver-target");
    assert.equal(call.args.p_expected_lock_version, 11);
  });
});
