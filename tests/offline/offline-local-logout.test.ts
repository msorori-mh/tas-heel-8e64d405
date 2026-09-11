import { expect, it } from "vitest";
import { createLocalLogoutStorage } from "../../src/integrations/supabase/localLogoutStorage";

it("clears durable credentials before notifying the client and survives recreation", async () => {
  const values = new Map([
    ["session", "old-token"],
    ["session-user", "old-user"],
    ["session-code-verifier", "old-verifier"],
  ]);
  const raw = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  const adapter = createLocalLogoutStorage(raw, "session");
  await adapter.clear(async () => {
    expect(await adapter.storage.getItem("session")).toBeNull();
    await adapter.storage.setItem("session", "stale-refresh");
  });
  expect(await createLocalLogoutStorage(raw, "session").storage.getItem("session")).toBeNull();
  expect(values.size).toBe(0);
});

it("waits for a previously started native preference write before committing logout", async () => {
  const values = new Map<string, string>();
  let release!: () => void;
  const raw = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) =>
      new Promise<void>((resolve) => {
        release = () => {
          values.set(key, value);
          resolve();
        };
      }),
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  const adapter = createLocalLogoutStorage(raw, "session");
  const writing = adapter.storage.setItem("session", "late-refresh");
  const clearing = adapter.clear(async () => {});
  release();
  await Promise.all([writing, clearing]);
  expect(values.size).toBe(0);
});
