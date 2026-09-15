type AuthStorage = {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
};

/**
 * A local sign-out first removes durable credentials. While the public Auth
 * client invalidates its refresh generation, block concurrent storage writes
 * from resurrecting the old session. No private Auth methods are used.
 */
export function createLocalLogoutStorage(raw: AuthStorage, sessionKey: string) {
  let clearing = false;
  const keys = [sessionKey, sessionKey + "-code-verifier", sessionKey + "-user"];
  const owns = (key: string) => keys.includes(key);
  const pendingWrites = new Set<Promise<void>>();
  const storage: AuthStorage = {
    getItem(key) {
      return clearing && owns(key) ? null : raw.getItem(key);
    },
    async setItem(key, value) {
      if (clearing && owns(key)) return;
      const write = Promise.resolve(raw.setItem(key, value));
      pendingWrites.add(write);
      try {
        await write;
      } finally {
        pendingWrites.delete(write);
      }
    },
    removeItem: (key) => raw.removeItem(key),
  };
  return {
    storage,
    async clear(invalidateClient: () => Promise<void>) {
      if (clearing) throw new Error("LOCAL_SIGN_OUT_IN_PROGRESS");
      clearing = true;
      try {
        await Promise.all([...pendingWrites]);
        for (const key of keys) await raw.removeItem(key);
        // The SDK now sees no access token, so scope:local does not require
        // a network revocation before emitting SIGNED_OUT.
        await invalidateClient();
        for (const key of keys) await raw.removeItem(key);
      } finally {
        clearing = false;
      }
    },
  };
}
