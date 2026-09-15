import { createClient } from "@supabase/supabase-js";
import { academySupabase, supabaseUrl, supabaseKey } from "../lib/supabase";

import type { LearningProgram, LearningLesson } from "../types";
import {
  acknowledge,
  activeOwner,
  hashBlob,
  put,
  readAll,
  readFile,
  setOwner,
  type Pack,
} from "./store";

let epoch = 0;
const inFlight = new Map<string, Promise<void>>();
export function revokeOfflineAccess() {
  epoch++;
  setOwner(null);
}
export async function signOutAcademy() {
  revokeOfflineAccess();
  return academySupabase.auth.signOut();
}
async function assertSession(owner: string) {
  const { data, error } = await academySupabase.auth.getSession();
  if (error || data.session?.user.id !== owner)
    throw new Error("تغير الحساب. سجّل الدخول بحساب صاحب التنزيلات.");
}
async function authorize(owner: string) {
  const { data: sessionData, error: sessionError } = await academySupabase.auth.getSession();
  const session = sessionData.session;
  if (sessionError || session?.user.id !== owner)
    throw new Error("يلزم تسجيل الدخول بحساب صاحب التنزيلات.");
  const { data, error } = await academySupabase.auth.getUser(session.access_token);
  if (error || data.user?.id !== owner) throw new Error("يلزم اتصال وتسجيل دخول صالح للمزامنة.");
  // Bind every request to this verified token, even if another tab changes the shared session.
  const client = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
    db: { schema: "academy" },
  });
  const profile = await client
    .from("teacher_profiles")
    .select("status")
    .eq("user_id", owner)
    .single();
  if (profile.error) throw new Error("تعذر الاتصال للتحقق من حساب المعلم.");
  if (profile.data?.status !== "ACTIVE") {
    if (activeOwner() === owner) revokeOfflineAccess();
    throw new Error("حساب المعلم غير نشط.");
  }
  return client;
}
function check(owner: string, generation: number, signal?: AbortSignal) {
  if (epoch !== generation || activeOwner() !== owner || signal?.aborted)
    throw new Error("أُوقفت العملية أو تغير الحساب.");
}
const allowedTypes = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
async function downloadFile(url: string, signal: AbortSignal): Promise<Blob> {
  const target = new URL(url);
  if (target.protocol !== "https:" || target.username || target.password)
    throw new Error("رابط غير مدعوم");
  // Never attach auth credentials to external resources. CORS must permit the download.
  const response = await fetch(target, {
    signal,
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!response.ok || !allowedTypes.has(type) || !response.body)
    throw new Error("المورد يحتاج الإنترنت أو لا يسمح بالتنزيل.");
  const limit = 25 * 1024 * 1024;
  const reader = response.body.getReader();
  let bytes = 0;
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) throw new Error("الملف أكبر من 25 ميجابايت.");
      chunks.push(value as Uint8Array<ArrayBuffer>);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  return new Blob(chunks, { type });
}
export async function downloadProgram(
  owner: string,
  program: LearningProgram,
  signal: AbortSignal,
  progress: (message: string) => void,
  refreshFiles = false,
) {
  const client = await authorize(owner);
  if (signal.aborted) throw new Error("أُلغي التنزيل");
  const generation = epoch;
  await assertSession(owner);
  setOwner(owner);
  const catalog = await client.rpc("list_my_learning");
  if (catalog.error) throw catalog.error;
  const visible = (catalog.data ?? []) as LearningProgram[];
  check(owner, generation, signal);
  const current = visible.find((p) => p.program_version_id === program.program_version_id);
  if (!current) throw new Error("البرنامج غير متاح لحسابك.");
  const result = await client.rpc("get_learning_lessons", {
    p_program_version_id: program.program_version_id,
  });
  if (result.error) throw result.error;
  const lessons = (result.data ?? []) as LearningLesson[];
  check(owner, generation, signal);
  const urls = [
    ...new Set(
      lessons
        .flatMap((l) => [
          l.lesson_type !== "VIDEO" ? l.resource_url : null,
          ...l.sections.map((s) => s.resource_url),
        ])
        .filter((u): u is string => Boolean(u)),
    ),
  ];
  const omitted = lessons
    .filter((l) => l.lesson_type === "VIDEO" && l.resource_url)
    .map((l) => l.resource_url!);
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    progress(`تنزيل الملفات ${i + 1} من ${urls.length}`);
    check(owner, generation, signal);
    const prior = await readFile(owner, url);
    check(owner, generation, signal);
    if (!refreshFiles && prior && (await hashBlob(prior.blob)) === prior.sha256) continue;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, 30000);
    try {
      const blob = await downloadFile(url, controller.signal);
      const sha256 = await hashBlob(blob);
      await assertSession(owner);
      check(owner, generation, signal);
      await put("files", { owner, id: url, blob, sha256 });
    } catch (error) {
      check(owner, generation, signal);
      if (error instanceof DOMException && error.name === "QuotaExceededError") throw error;
      omitted.push(url);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    }
  }
  await assertSession(owner);
  check(owner, generation, signal);
  const pack: Pack = {
    owner,
    id: program.program_version_id,
    program: current,
    lessons,
    savedAt: new Date().toISOString(),
    omitted,
  };
  await put("packs", pack);
  check(owner, generation, signal);
  await navigator.storage?.persist?.().catch(() => false);
  window.dispatchEvent(new Event("academy-offline-change"));
  return pack;
}
export function syncAcademy(owner: string): Promise<void> {
  const existing = inFlight.get(owner);
  if (existing) return existing;
  const task = (async () => {
    if (!navigator.onLine) return;
    const client = await authorize(owner);
    await assertSession(owner);
    if (activeOwner() !== owner) return;
    const generation = epoch;
    const events = await readAll("events", owner);
    // Sequential, bounded replay: a lost response leaves its operation pending.
    for (const entry of events.slice(0, 100)) {
      check(owner, generation);
      await assertSession(owner);
      check(owner, generation);
      const result =
        entry.kind === "complete"
          ? await client.rpc("complete_lesson", { p_lesson_id: entry.lessonId })
          : await client.rpc("save_offline_note", {
              p_operation_id: entry.id,
              p_lesson_id: entry.lessonId,
              p_body: entry.text,
            });
      if (result.error)
        throw new Error(
          entry.kind === "note"
            ? "الملاحظة محفوظة على جهازك. تعذرت مزامنتها؛ قد يلزم تفعيل خدمة الملاحظات على الخادم."
            : "تعذرت مزامنة التقدم. بقي محفوظًا على جهازك.",
        );
      check(owner, generation);
      await assertSession(owner);
      check(owner, generation);
      await acknowledge(entry);
    }
    const result = await client
      .from("offline_notes")
      .select("operation_id,lesson_id,body,created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    check(owner, generation);
    if (!result.error)
      for (const note of result.data ?? []) {
        check(owner, generation);
        await put("notes", {
          owner,
          id: note.operation_id,
          lessonId: note.lesson_id,
          kind: "note",
          text: note.body,
          createdAt: note.created_at,
          synced: true,
        });
      }
    window.dispatchEvent(new Event("academy-offline-change"));
  })().finally(() => inFlight.delete(owner));
  inFlight.set(owner, task);
  return task;
}
