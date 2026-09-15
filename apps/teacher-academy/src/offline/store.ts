import type { LearningLesson, LearningProgram } from "../types";

export const DB_NAME = "tamkeen-academy-offline-v1";
export const OWNER_KEY = "tamkeen-academy-offline-owner";
export type Pack = {
  owner: string;
  id: string;
  program: LearningProgram;
  lessons: LearningLesson[];
  savedAt: string;
  omitted: string[];
};
export type SavedFile = { owner: string; id: string; blob: Blob; sha256: string };
export type Entry = {
  owner: string;
  id: string;
  lessonId: string;
  kind: "complete" | "note";
  text?: string;
  createdAt: string;
  synced?: boolean;
};
type Stores = { packs: Pack; files: SavedFile; events: Entry; notes: Entry };
const stores: Array<keyof Stores> = ["packs", "files", "events", "notes"];

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      for (const name of stores)
        request.result
          .createObjectStore(name, { keyPath: ["owner", "id"] })
          .createIndex("owner", "owner");
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("أغلق تبويبات الأكاديمية الأخرى وأعد المحاولة."));
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}
export async function readAll<K extends keyof Stores>(
  name: K,
  owner: string,
): Promise<Stores[K][]> {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(name, "readonly");
      const request = tx.objectStore(name).index("owner").getAll(owner);
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function readFile(owner: string, id: string): Promise<SavedFile | undefined> {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("files", "readonly");
      const request = tx.objectStore("files").get([owner, id]);
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function put<K extends keyof Stores>(name: K, value: Stores[K]): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(name, "readwrite");
      tx.objectStore(name).put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function queue(entry: Entry): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["events", "notes"], "readwrite");
      tx.objectStore("events").put(entry);
      if (entry.kind === "note") tx.objectStore("notes").put({ ...entry, synced: false });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function acknowledge(entry: Entry): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["events", "notes", "packs"], "readwrite");
      tx.objectStore("events").delete([entry.owner, entry.id]);
      if (entry.kind === "note") tx.objectStore("notes").put({ ...entry, synced: true });
      else {
        const request = tx.objectStore("packs").index("owner").openCursor(entry.owner);
        request.onsuccess = () => {
          const c = request.result;
          if (!c) return;
          const p = c.value as Pack;
          c.update({
            ...p,
            lessons: p.lessons.map((l) =>
              l.lesson_id === entry.lessonId ? { ...l, completed: true } : l,
            ),
          });
          c.continue();
        };
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function deleteDownloads(owner: string): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["packs", "files"], "readwrite");
      for (const name of ["packs", "files"]) {
        const request = tx.objectStore(name).index("owner").openKeyCursor(owner);
        request.onsuccess = () => {
          const c = request.result;
          if (c) {
            tx.objectStore(name).delete(c.primaryKey);
            c.continue();
          }
        };
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export function activeOwner(): string | null {
  try {
    return localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}
export function setOwner(owner: string | null): void {
  if (owner) localStorage.setItem(OWNER_KEY, owner);
  else localStorage.removeItem(OWNER_KEY);
  window.dispatchEvent(new Event("academy-offline-change"));
}
export async function hashBlob(blob: Blob): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
