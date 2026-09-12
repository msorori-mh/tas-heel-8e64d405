import { Capacitor, CapacitorHttp } from "@capacitor/core";

const STUDENT_API_ORIGIN = "https://studentamkeen.com";

/** Only authenticated curriculum downloads may cross the native HTTP bridge. */
export async function offlineApiGet(
  path: string,
  token: string,
  binary = false,
  signal?: AbortSignal,
): Promise<Response> {
  if (
    !/^\/api\/(offline-pack\/(manifest|artifact)|subject-textbook|lesson-file)\/[^/?#]+$/.test(path)
  ) {
    throw new Error("OFFLINE_API_PATH_INVALID");
  }
  if (signal?.aborted) throw new Error("OFFLINE_DOWNLOAD_ABORTED");
  const headers = { Authorization: `Bearer ${token}` };
  if (!Capacitor.isNativePlatform()) {
    return fetch(path, { headers, signal });
  }
  const response = await CapacitorHttp.get({
    url: STUDENT_API_ORIGIN + path,
    headers,
    responseType: binary ? "arraybuffer" : "json",
    connectTimeout: 30_000,
    readTimeout: 60_000,
    disableRedirects: true,
  });
  if (signal?.aborted) throw new Error("OFFLINE_DOWNLOAD_ABORTED");
  let body: BodyInit;
  if (binary && typeof response.data === "string") {
    body = Uint8Array.from(atob(response.data), (char) => char.charCodeAt(0));
  } else if (binary && response.data instanceof ArrayBuffer) {
    body = response.data;
  } else {
    body = JSON.stringify(response.data);
  }
  return new Response(body, { status: response.status, headers: response.headers });
}
