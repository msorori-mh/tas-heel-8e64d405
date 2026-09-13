/* eslint-disable @typescript-eslint/no-explicit-any -- VM events and Response/Cache doubles are supplied by the worker harness. */
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";

const source = readFileSync("public/sw.js", "utf8");
const origin = "https://studentamkeen.com";
function response(label: string, control = "public, max-age=31536000", type = "basic") {
  const result = {
    label,
    ok: true,
    type,
    headers: new Headers({ "Cache-Control": control }),
    clone: () => result,
  };
  return result;
}
function worker(saved?: ReturnType<typeof response>, failStorage = false) {
  const listeners: Record<string, (event: any) => void> = {};
  const fetch = vi.fn().mockResolvedValue(response("network"));
  const cache = {
    match: vi.fn().mockResolvedValue(saved),
    put: vi
      .fn()
      .mockImplementation(() =>
        failStorage ? Promise.reject(new Error("quota")) : Promise.resolve(),
      ),
  };
  const open = vi.fn().mockResolvedValue(cache);
  runInNewContext(source, {
    URL,
    Response,
    fetch,
    caches: { open },
    self: {
      location: { origin },
      addEventListener: (name: string, callback: any) => {
        listeners[name] = callback;
      },
    },
  });
  const request = (path: string, extra: Record<string, unknown> = {}) => {
    let result: Promise<any> | undefined;
    const lifetime: Promise<any>[] = [];
    listeners.fetch({
      request: {
        url: path.startsWith("http") ? path : origin + path,
        method: "GET",
        mode: "cors",
        headers: new Headers(),
        ...extra,
      },
      respondWith: (p: Promise<any>) => {
        result = p;
      },
      waitUntil: (p: Promise<any>) => {
        lifetime.push(p);
      },
    });
    return { result, lifetime };
  };
  return { request, fetch, cache, open };
}
it.each([
  "/assets/index-B1234xyz.js",
  "/assets/lessons._lessonId-C-a_12X8.js",
  "/assets/styles-B1234xyz.css",
])("opens a warm hashed asset without waiting for a stalled network: %s", async (path) => {
  const w = worker(response("saved"));
  w.fetch.mockImplementation(() => new Promise(() => {}));
  let resolved: any;
  w.request(path).result!.then((r) => {
    resolved = r;
  });
  for (let i = 0; i < 15; i++) await Promise.resolve();
  expect(resolved?.label).toBe("saved");
  expect(w.fetch).not.toHaveBeenCalled();
});
it("downloads and saves a new build URL", async () => {
  const w = worker();
  const request = w.request("/assets/index-NEW12345.js");
  expect((await request.result).label).toBe("network");
  await Promise.all(request.lifetime);
  expect(w.fetch).toHaveBeenCalledTimes(1);
  expect(w.cache.put).toHaveBeenCalledTimes(1);
});
it("keeps unversioned assets network-first", async () => {
  const w = worker(response("old"));
  expect((await w.request("/assets/runtime.js").result).label).toBe("network");
  expect(w.fetch).toHaveBeenCalledTimes(1);
});
it.each(["private", "no-store"])("does not reuse or store %s responses", async (control) => {
  const w = worker(response("private cached", control));
  w.fetch.mockResolvedValue(response("network", control));
  expect((await w.request("/assets/index-B1234xyz.js").result).label).toBe("network");
  expect(w.cache.put).not.toHaveBeenCalled();
});
it("does not store opaque or error responses", async () => {
  for (const r of [response("opaque", "public", "opaque"), { ...response("error"), ok: false }]) {
    const w = worker();
    w.fetch.mockResolvedValue(r);
    expect(await w.request("/assets/index-B1234xyz.js").result).toBe(r);
    expect(w.cache.put).not.toHaveBeenCalled();
  }
});
it("still returns successful downloads if storage is full or unavailable", async () => {
  const w = worker(undefined, true);
  const r = w.request("/assets/index-B1234xyz.js");
  expect((await r.result).label).toBe("network");
  await Promise.all(r.lifetime);
  w.open.mockRejectedValue(new Error("storage unavailable"));
  expect((await w.request("/assets/index-B1234xyz.js").result).label).toBe("network");
});
it.each([
  "/auth/callback",
  "/admin",
  "/api/lesson-file/id",
  "/_server/xyz",
  "/exams/1",
  "/import-templates/a.xlsx",
  "https://supabase.example/assets/index-B1234xyz.js",
])("does not intercept sensitive or cross-origin paths: %s", (path) => {
  const w = worker();
  expect(w.request(path).result).toBeUndefined();
  expect(w.fetch).not.toHaveBeenCalled();
});
it("does not intercept writes or cache student navigation HTML", async () => {
  const w = worker();
  expect(w.request("/assets/index-B1234xyz.js", { method: "POST" }).result).toBeUndefined();
  await w.request("/lessons/1", { mode: "navigate" }).result;
  expect(w.cache.put).not.toHaveBeenCalled();
  expect(w.open).not.toHaveBeenCalled();
});
it("bypasses explicit no-store and authenticated requests even for a warm hashed URL", () => {
  const w = worker(response("saved"));
  expect(w.request("/assets/index-B1234xyz.js", { cache: "no-store" }).result).toBeUndefined();
  expect(
    w.request("/assets/index-B1234xyz.js", {
      headers: new Headers({ Authorization: "Bearer TEST_ONLY" }),
    }).result,
  ).toBeUndefined();
});
