import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryPreviewTokenReplayStore } from "../../support/in-memory-replay-store.ts";
import {
  mintPreviewToken,
  validatePreviewToken,
  type PreviewTokenEnvelope,
  type PreviewTokenBindingContext,
  type PreviewTokenReplayStore,
} from "../../../src/lib/server/question-bank/import/preview-token-server.ts";

const TEST_SECRET = "test-secret-12345678901234567890123456789012";

function createValidTokenAndContext(jti = "jti-test-1", expiresAt = Date.now() + 60000) {
  const now = Date.now();
  const envelope: PreviewTokenEnvelope = {
    token_id: jti,
    snapshot_id: "snap-1",
    snapshot_version: 1,
    content_hash: "hash-1",
    actor_id: "actor-123",
    scope: "tenant:default",
    issued_at: now - 1000,
    expires_at: expiresAt,
    jti,
  };
  const token = mintPreviewToken(envelope, { secret: TEST_SECRET });
  const context: PreviewTokenBindingContext = {
    snapshot_id: "snap-1",
    snapshot_version: 1,
    content_hash: "hash-1",
    actor_id: "actor-123",
    scope: "tenant:default",
    now,
  };
  return { token, envelope, context };
}

test("Replay Store: first consume returns true", async () => {
  const store = new InMemoryPreviewTokenReplayStore();
  const res = await store.consumeOnce("jti-1", Date.now() + 10000);
  assert.equal(res, true);
});

test("Replay Store: second consume returns false", async () => {
  const store = new InMemoryPreviewTokenReplayStore();
  await store.consumeOnce("jti-2", Date.now() + 10000);
  const res = await store.consumeOnce("jti-2", Date.now() + 10000);
  assert.equal(res, false);
});

test("Replay Store: concurrent Promise.all for same JTI yields only 1 success", async () => {
  const store = new InMemoryPreviewTokenReplayStore();
  const jti = "jti-concurrent";
  const exp = Date.now() + 10000;
  const results = await Promise.all([
    store.consumeOnce(jti, exp),
    store.consumeOnce(jti, exp),
    store.consumeOnce(jti, exp),
    store.consumeOnce(jti, exp),
  ]);
  const successCount = results.filter((r) => r === true).length;
  assert.equal(successCount, 1);
  assert.equal(results.filter((r) => r === false).length, 3);
});

test("Replay Store: expired cleanup allows re-use after expiration", async () => {
  const store = new InMemoryPreviewTokenReplayStore();
  const jti = "jti-expired";
  await store.consumeOnce(jti, Date.now() - 500);
  const res = await store.consumeOnce(jti, Date.now() + 10000);
  assert.equal(res, true);
});

test("Replay Store: store throw = token rejected", async () => {
  const throwingStore: PreviewTokenReplayStore = {
    async consumeOnce() {
      throw new Error("Storage Connection Error");
    },
  };
  const { token, context } = createValidTokenAndContext("jti-throw");
  const res = await validatePreviewToken(token, context, { secret: TEST_SECRET, replayStore: throwingStore });
  assert.equal(res.ok, false);
});

test("Replay Store: store timeout/failure = rejected", async () => {
  const failingStore: PreviewTokenReplayStore = {
    async consumeOnce() {
      return Promise.reject(new Error("Timeout/Failure"));
    },
  };
  const { token, context } = createValidTokenAndContext("jti-fail");
  const res = await validatePreviewToken(token, context, { secret: TEST_SECRET, replayStore: failingStore });
  assert.equal(res.ok, false);
});

test("Replay Store: no store = configuration failure (rejected)", async () => {
  const { token, context } = createValidTokenAndContext("jti-nostore");
  const res = await validatePreviewToken(token, context, { secret: TEST_SECRET });
  assert.equal(res.ok, false);
});

test("Replay Store: copied token = rejected on second attempt", async () => {
  const store = new InMemoryPreviewTokenReplayStore();
  const { token, context } = createValidTokenAndContext("jti-copied");

  const res1 = await validatePreviewToken(token, context, { secret: TEST_SECRET, replayStore: store });
  assert.equal(res1.ok, true);

  const res2 = await validatePreviewToken(token, context, { secret: TEST_SECRET, replayStore: store });
  assert.equal(res2.ok, false);
});

test("Replay Store: replayed token = rejected", async () => {
  const store = new InMemoryPreviewTokenReplayStore();
  const { token, context } = createValidTokenAndContext("jti-replay");

  const firstUse = await validatePreviewToken(token, context, { secret: TEST_SECRET, replayStore: store });
  assert.equal(firstUse.ok, true);

  const replayUse = await validatePreviewToken(token, context, { secret: TEST_SECRET, replayStore: store });
  assert.equal(replayUse.ok, false);
});

test("Replay Store: validatePreviewToken actually uses await", async () => {
  let awaitExecuted = false;
  const trackingStore: PreviewTokenReplayStore = {
    async consumeOnce() {
      await new Promise((resolve) => setTimeout(resolve, 10));
      awaitExecuted = true;
      return true;
    },
  };
  const { token, context } = createValidTokenAndContext("jti-await");
  const res = await validatePreviewToken(token, context, { secret: TEST_SECRET, replayStore: trackingStore });
  assert.equal(res.ok, true);
  assert.equal(awaitExecuted, true);
});
