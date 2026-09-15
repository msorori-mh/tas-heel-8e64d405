import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const store = read(
  "android/app/src/main/java/app/studentamkeen/tamkeen/TamkeenOfflineStateStore.java",
);
const plugin = read(
  "android/app/src/main/java/app/studentamkeen/tamkeen/TamkeenOfflineStatePlugin.java",
);
const content = read(
  "android/app/src/main/java/app/studentamkeen/tamkeen/TamkeenOfflineContentPlugin.java",
);
const activity = read("android/app/src/main/java/app/studentamkeen/tamkeen/MainActivity.java");
const manifest = read("android/app/src/main/AndroidManifest.xml");

describe("S3.2 encrypted SQLite offline state", () => {
  it("stores one encrypted state envelope in an app-private SQLite transaction", () => {
    expect(store).toContain('DATABASE_NAME = "tamkeen-offline.db"');
    expect(store).toContain("CREATE TABLE offline_state");
    expect(store).toContain("encrypted_payload BLOB NOT NULL");
    expect(store).toContain("database.beginTransaction()");
    expect(store).toContain("database.setTransactionSuccessful()");
    expect(store).toContain("SQLiteDatabase.CONFLICT_REPLACE");
    expect(store).not.toMatch(/DROP TABLE|deleteDatabase/);
  });

  it("encrypts with a non-exportable Android Keystore AES-GCM key", () => {
    expect(store).toContain('KeyStore.getInstance("AndroidKeyStore")');
    expect(store).toContain(
      'KeyGenerator.getInstance(\n                KeyProperties.KEY_ALGORITHM_AES,\n                "AndroidKeyStore"',
    );
    expect(store).toContain('Cipher.getInstance("AES/GCM/NoPadding")');
    expect(store).toContain("setRandomizedEncryptionRequired(true)");
    expect(store).toContain("new GCMParameterSpec(128, iv)");
    expect(store).not.toMatch(/Base64|SharedPreferences/);
  });

  it("migrates legacy JSON only after encrypted read-back and removes plaintext", () => {
    expect(store).toContain("readLegacy(context)");
    expect(store).toContain("writeDatabase(context, legacy)");
    expect(store).toContain("offline_state_migration_verify_failed");
    expect(store).toContain("deleteLegacy(context)");
    expect(store).toContain("offline_legacy_state_delete_failed");
  });

  it("keeps all native offline readers and writers on the same store", () => {
    expect(plugin).toContain('@CapacitorPlugin(name = "TamkeenOfflineState")');
    expect(activity).toContain("registerPlugin(TamkeenOfflineStatePlugin.class)");
    expect(content).toContain("TamkeenOfflineStateStore.read(getContext())");
    expect(content).toContain("TamkeenOfflineStateStore.write(getContext(), next)");
    expect(content).not.toContain("foundation-v1.next.json");
  });

  it("prevents Android backup from separating ciphertext from its device key", () => {
    expect(manifest).toContain('android:allowBackup="false"');
  });
});
