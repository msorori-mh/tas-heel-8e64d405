import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { NodeRequest } from "srvx/node";

test("srvx Request clone preserves auth and cancellation on the Node host", async () => {
  const server = createServer((req, res) => {
    try {
      const source = new NodeRequest({ req, res });
      const controller = new AbortController();
      const copied = new Request(source.clone(), { signal: controller.signal });
      assert.equal(copied.url, source.url);
      assert.equal(copied.method, "GET");
      assert.equal(copied.headers.get("authorization"), "Bearer TEST_ONLY");
      controller.abort();
      assert.equal(copied.signal.aborted, true);
      res.end("PASS");
    } catch (error) {
      res.statusCode = 500;
      res.end(String(error));
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/test`, {
      headers: { authorization: "Bearer TEST_ONLY" },
    });
    assert.equal(r.status, 200);
    assert.equal(await r.text(), "PASS");
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
