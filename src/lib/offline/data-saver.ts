/** Device preference: automatic downloads require an explicit opt-out. */
const KEY = "tamkeen-data-saver-v1";
let enabled = true;
let revision = 0;
let initialized: Promise<boolean> | null = null;
let writes = Promise.resolve();
const listeners = new Set<() => void>();

export const dataSaverSnapshot = () => enabled;
export function subscribeDataSaver(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function notify() {
  listeners.forEach((listener) => listener());
}

export function getDataSaverEnabled(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(true);
  if (!initialized) {
    const observedRevision = revision;
    initialized = import("@capacitor/preferences")
      .then(async ({ Preferences }) => {
        const result = await Preferences.get({ key: KEY });
        if (observedRevision === 0 && revision === observedRevision) {
          enabled = result.value !== "off";
          notify();
        }
        return enabled;
      })
      .catch(() => enabled);
  }
  return initialized.then(() => enabled);
}

export async function setDataSaverEnabled(value: boolean): Promise<void> {
  revision += 1;
  enabled = value;
  notify(); // Stop automatic work immediately, before persisting the setting.
  const write = writes
    .catch(() => undefined)
    .then(async () => {
      const { Preferences } = await import("@capacitor/preferences");
      await Preferences.set({ key: KEY, value: value ? "on" : "off" });
    });
  writes = write;
  await write;
}
