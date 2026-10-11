import assert from "node:assert/strict";
import test from "node:test";
import { extractReceiptDirect } from "../../src/lib/receipt-ocr.server.ts";

const input = {
  imageBase64: Buffer.from("synthetic receipt fixture only").toString("base64"),
  mimeType: "image/png",
};
const config = { apiKey: "TEST_ONLY", model: "gemini-test-model" };
const response = (text: string, finishReason = "STOP") =>
  new Response(
    JSON.stringify({
      candidates: [{ finishReason, content: { parts: [{ text }] } }],
    }),
  );

test("missing configuration never sends a receipt anywhere", async () => {
  let calls = 0;
  const fetcher = (async () => {
    calls++;
    return response("{}");
  }) as typeof fetch;
  for (const conf of [{}, { apiKey: "TEST_ONLY" }, { ...config, model: "../another-host" }]) {
    await assert.rejects(extractReceiptDirect(input, conf, fetcher), /receipt_ocr_unavailable/);
  }
  assert.equal(calls, 0);
});

test("direct request uses a fixed Google host, header secret, no redirect and bounded timeout", async () => {
  const result = await extractReceiptDirect(input, config, (async (url, init) => {
    assert.equal(
      url,
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-test-model:generateContent",
    );
    assert.equal(init?.redirect, "error");
    assert.ok(init?.signal);
    assert.equal(new Headers(init?.headers).get("x-goog-api-key"), "TEST_ONLY");
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.contents[0].parts[1].inlineData, {
      mimeType: "image/png",
      data: input.imageBase64,
    });
    assert.equal(body.generationConfig.responseMimeType, "application/json");
    return response(
      JSON.stringify({ sender_name: "طالب تجريبي", amount: "1,200", confidence: { amount: 3 } }),
    );
  }) as typeof fetch);
  assert.equal(result.amount, 1200);
  assert.equal(result.confidence.amount, 1);
  assert.equal(result.transaction_number, null);
});

test("truncated, blocked and malformed outputs cannot populate the form", async () => {
  for (const res of [
    response("{}", "MAX_TOKENS"),
    response("private raw text"),
    response("null"),
    response("[]"),
  ]) {
    await assert.rejects(
      extractReceiptDirect(input, config, (async () => res) as typeof fetch),
      /receipt_ocr_invalid_response/,
    );
  }
});

test("provider and network errors never disclose upstream bodies or credentials", async () => {
  for (const status of [401, 403, 500]) {
    await assert.rejects(
      extractReceiptDirect(
        input,
        config,
        (async () => new Response("PRIVATE", { status })) as typeof fetch,
      ),
      { message: "receipt_ocr_unavailable" },
    );
  }
  await assert.rejects(
    extractReceiptDirect(input, config, (async () => {
      throw new Error("PRIVATE");
    }) as typeof fetch),
    { message: "receipt_ocr_unavailable" },
  );
  await assert.rejects(
    extractReceiptDirect(
      input,
      config,
      (async () => new Response("", { status: 429 })) as typeof fetch,
    ),
    { message: "rate_limited" },
  );
});

test("invalid base64 is rejected before network access", async () => {
  let calls = 0;
  await assert.rejects(
    extractReceiptDirect({ ...input, imageBase64: "!".repeat(32) }, config, (async () => {
      calls++;
      return response("{}");
    }) as typeof fetch),
  );
  assert.equal(calls, 0);
});
