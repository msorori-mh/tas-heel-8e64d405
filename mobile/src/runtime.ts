import { registerPlugin } from "@capacitor/core";
import { supabase } from "../../src/integrations/supabase/client";
import { drainLocalQueue, type NativeQueue } from "./sync";
import { offlineReconnectDelay } from "../../src/lib/offline/sync-backoff";

const queue = registerPlugin<NativeQueue>("TamkeenOfflineContent");
let running = false;
let disposed = false;
let timer: ReturnType<typeof setTimeout> | undefined;
function announce(status: string) {
  window.dispatchEvent(new CustomEvent("tamkeen:sync-status", { detail: { status } }));
}
async function sync() {
  if (disposed || running) return;
  if (!navigator.onLine) { announce("offline"); return; }
  running = true;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) { announce("sign-in"); return; }
    const userId = data.session.user.id;
    announce("syncing");
    const result = await drainLocalQueue(queue, userId, async (record) => {
      if (disposed) throw new Error("SYNC_DISPOSED");
      const { data: current } = await supabase.auth.getSession();
      if (current.session?.user.id !== userId) throw new Error("SYNC_SESSION_CHANGED");
      // The SQL contract accepts null for fields not used by this mutation kind.
      // Generated database typings currently omit that nullability (as in offline-sync.ts).
      const rpc = supabase.rpc.bind(supabase) as unknown as (
        name: "apply_offline_learning_mutation", args: Record<string, unknown>
      ) => Promise<{ error: unknown }>;
      const { error: failure } = await rpc("apply_offline_learning_mutation", {
        _idempotency_key: record.idempotencyKey,
        _kind: record.kind,
        _entity_id: record.entityId,
        _lesson_id: record.lessonId,
        _occurred_at: record.occurredAt,
        _progress_percent: record.progressPercent,
        _answer_text: record.answerText,
        _payload_sha256: record.payloadSha256,
      });
      if (failure) throw failure;
    });
    announce(result.pending ? "pending" : "synced");
    if (result.fullBatch) schedule();
  } catch { announce("pending"); }
  finally { running = false; }
}
function schedule() {
  if (disposed || timer !== undefined) return;
  timer = setTimeout(() => { timer = undefined; void sync(); }, offlineReconnectDelay());
}
window.addEventListener("online", schedule);
window.addEventListener("tamkeen:sync-request", () => void sync());
document.addEventListener("visibilitychange", () => { if (!document.hidden) schedule(); });
const retry = setInterval(schedule, 60_000);
window.addEventListener("pagehide", () => { disposed = true; clearInterval(retry); clearTimeout(timer); });
schedule();
