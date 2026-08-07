import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import JSZip from "jszip";
import { PublishedHtmlResourceViewer } from "../components/lessons/PublishedHtmlResourceViewer";
import type { LessonHtmlResourceItem } from "./api/html-pipeline.functions";

// ─── JSDOM bootstrap ───────────────────────────────────────────────────────

function setupJSDOM() {
  const dom = new JSDOM(
    "<!DOCTYPE html><html><body><div id='root'></div></body></html>",
    { url: "http://localhost/", runScripts: "dangerously", resources: "usable" },
  );
  const win = dom.window;

  (globalThis as Record<string, unknown>).window = win;
  (globalThis as Record<string, unknown>).document = win.document;
  (globalThis as Record<string, unknown>).HTMLElement = win.HTMLElement;
  (globalThis as Record<string, unknown>).HTMLIFrameElement = win.HTMLIFrameElement;
  (globalThis as Record<string, unknown>).Event = win.Event;
  (globalThis as Record<string, unknown>).CustomEvent = win.CustomEvent;
  (globalThis as Record<string, unknown>).MessageEvent = win.MessageEvent;
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

  try {
    Object.defineProperty(globalThis, "navigator", {
      value: win.navigator,
      configurable: true,
      writable: true,
    });
  } catch {
    // navigator might already be defined
  }

  if (!win.crypto) {
    (win as Record<string, unknown>).crypto = globalThis.crypto;
  }

  return dom;
}

// ─── Test helpers ───────────────────────────────────────────────────────────

async function buildZipBuffer(htmlBody: string): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file("package/index.html", `<html><body>${htmlBody}</body></html>`);
  zip.file(
    "package/manifest.json",
    JSON.stringify({ entry_file: "index.html" }),
  );
  return zip.generateAsync({ type: "arraybuffer" });
}

function makeResource(
  overrides: Partial<LessonHtmlResourceItem> & {
    resourceId: string;
    signedUrl: string;
  },
): LessonHtmlResourceItem {
  return {
    resourceType: "mind_map_html",
    title: "Test Resource",
    resourceCode: "RES-001",
    version: 1,
    expiresInSeconds: 900,
    ...overrides,
  };
}

interface MockResponse {
  ok: boolean;
  status: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

/**
 * Fetch mock with per-call control. Each call is tracked. Callers can configure
 * responses per call index. Supports AbortSignal.
 */
function createFetchMock() {
  const calls: string[] = [];
  const responses: Map<number, MockResponse | Error> = new Map();
  const pendingAborts: Map<number, AbortSignal> = new Map();

  const mockFn = (
    input: string | URL | Request,
    init?: { signal?: AbortSignal },
  ): Promise<MockResponse> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;
    const idx = calls.length;
    calls.push(url);

    if (init?.signal) {
      pendingAborts.set(idx, init.signal);
    }

    const configured = responses.get(idx);
    if (configured) {
      if (configured instanceof Error) {
        return Promise.reject(configured);
      }
      return Promise.resolve(configured);
    }

    // Default: pending until explicitly resolved
    return new Promise<MockResponse>((resolve, reject) => {
      if (init?.signal) {
        if (init.signal.aborted) {
          const err = new Error("The operation was aborted.");
          err.name = "AbortError";
          reject(err);
          return;
        }
        init.signal.addEventListener("abort", () => {
          const err = new Error("The operation was aborted.");
          err.name = "AbortError";
          reject(err);
        });
      }
      // Store resolve/reject for later manual control
      pendingResolvers.set(idx, { resolve, reject });
    });
  };

  const pendingResolvers: Map<
    number,
    { resolve: (r: MockResponse) => void; reject: (e: Error) => void }
  > = new Map();

  return {
    mockFn,
    calls,
    /** Configure response for call at index BEFORE it happens */
    setResponse(index: number, response: MockResponse | Error) {
      responses.set(index, response);
    },
    /** Resolve a pending call at index */
    resolveCall(index: number, response: MockResponse) {
      const resolver = pendingResolvers.get(index);
      if (resolver) {
        resolver.resolve(response);
        pendingResolvers.delete(index);
      }
    },
    /** Reject a pending call at index */
    rejectCall(index: number, err: Error) {
      const resolver = pendingResolvers.get(index);
      if (resolver) {
        resolver.reject(err);
        pendingResolvers.delete(index);
      }
    },
    isAborted(index: number): boolean {
      return pendingAborts.get(index)?.aborted ?? false;
    },
  };
}

function tick(ms = 50): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Repeatedly flush React updates via act() until the condition is met or timeout.
 * Necessary because async state updates from fetch/await chains may span
 * multiple microtask boundaries that a single act() doesn't capture.
 */
async function waitFor(
  condition: () => boolean,
  timeoutMs = 3000,
  intervalMs = 20,
): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("waitFor timed out");
    }
    await act(async () => {
      await new Promise((r) => setTimeout(r, intervalMs));
    });
  }
}

function failedResponse(status = 500): MockResponse {
  return { ok: false, status, arrayBuffer: async () => new ArrayBuffer(0) };
}

function okResponse(body: ArrayBuffer): MockResponse {
  return { ok: true, status: 200, arrayBuffer: async () => body };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test("A — Reload: URL1 → error → reload → URL2, URL1 never reused", async () => {
  const dom = setupJSDOM();
  const container = dom.window.document.getElementById("root")!;
  const fm = createFetchMock();
  const origFetch = globalThis.fetch;
  globalThis.fetch = fm.mockFn as unknown as typeof globalThis.fetch;

  const URL1 = "https://storage.local/signed/resource-a?token=1";
  const URL2 = "https://storage.local/signed/resource-a?token=2";
  assert.notEqual(URL1, URL2);

  // Pre-configure: call 0 fails, call 1 succeeds
  const zipBuf = await buildZipBuffer("<h1>Content V2</h1>");
  fm.setResponse(0, failedResponse(500));
  fm.setResponse(1, okResponse(zipBuf));

  const resource = makeResource({ resourceId: "res-a", signedUrl: URL1 });
  const reloadFn = async () => URL2;

  let root: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(
      React.createElement(PublishedHtmlResourceViewer, {
        resource,
        onReloadSignedUrl: reloadFn,
      }),
    );
  });

  // Wait for error state (fetch resolves + state updates flush)
  await waitFor(() => container.querySelector("button") !== null);

  // First fetch should be URL1, component in error state
  assert.equal(fm.calls.length, 1, "Exactly one fetch call after mount");
  assert.equal(fm.calls[0], URL1, "First fetch must use URL1");

  const retryBtn = container.querySelector("button")!;
  assert.ok(
    container.textContent?.includes("فشل تحميل المورد"),
    "Error message must be shown",
  );

  // Click reload → onReloadSignedUrl returns URL2 → second fetch
  await act(async () => {
    retryBtn.click();
  });

  // Wait for ready state (second fetch resolves + iframe renders)
  await waitFor(() => container.querySelector("iframe") !== null);

  // Second fetch should be URL2
  assert.equal(fm.calls.length, 2, "Exactly two fetch calls after reload");
  assert.equal(fm.calls[1], URL2, "Second fetch must use URL2");

  // URL1 was used exactly once, never again
  const url1Count = fm.calls.filter((u) => u === URL1).length;
  assert.equal(url1Count, 1, "URL1 must be fetched exactly once, never reused");

  // Component should be in ready state (iframe rendered by InteractiveResourceViewer)
  const iframe = container.querySelector("iframe");
  assert.ok(iframe, "iframe must exist after successful load of URL2");

  await act(async () => {
    root.unmount();
  });
  globalThis.fetch = origFetch;
});

test("5 — Signing failure: no second fetch, error state shown, no stale content", async () => {
  const dom = setupJSDOM();
  const container = dom.window.document.getElementById("root")!;
  const fm = createFetchMock();
  const origFetch = globalThis.fetch;
  globalThis.fetch = fm.mockFn as unknown as typeof globalThis.fetch;

  const URL1 = "https://storage.local/signed/resource-s?token=1";

  // Pre-configure: call 0 fails
  fm.setResponse(0, failedResponse(500));

  const resource = makeResource({ resourceId: "res-s", signedUrl: URL1 });
  const reloadFn = async () => null; // signing failure

  let root: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(
      React.createElement(PublishedHtmlResourceViewer, {
        resource,
        onReloadSignedUrl: reloadFn,
      }),
    );
  });

  // Wait for error state
  await waitFor(() => container.querySelector("button") !== null);

  // Initial fetch with URL1, error state
  assert.equal(fm.calls.length, 1, "Initial fetch must happen");
  assert.equal(fm.calls[0], URL1, "Initial fetch must use URL1");

  const retryBtn = container.querySelector("button")!;

  // Click retry → signer returns null → no new fetch
  await act(async () => {
    retryBtn.click();
  });
  await act(async () => {
    await tick(100);
  });

  // No second fetch should have happened
  assert.equal(fm.calls.length, 1, "No second fetch after signing failure");

  // Error state must be visible with signing failure message
  const errorText = container.textContent ?? "";
  assert.ok(
    errorText.includes("تعذّر تجديد رابط الوصول الآمن"),
    "Error message about signing failure must be displayed",
  );

  // No iframe (not in ready state)
  const iframe = container.querySelector("iframe");
  assert.equal(iframe, null, "No iframe in error state — stale content not displayed");

  await act(async () => {
    root.unmount();
  });
  globalThis.fetch = origFetch;
});

test("6 — Old-resource race: stale fetch for A ignored after switch to B", async () => {
  const dom = setupJSDOM();
  const container = dom.window.document.getElementById("root")!;
  const fm = createFetchMock();
  const origFetch = globalThis.fetch;
  globalThis.fetch = fm.mockFn as unknown as typeof globalThis.fetch;

  const URL_A = "https://storage.local/signed/res-old?token=1";
  const URL_B = "https://storage.local/signed/res-new?token=1";

  const resourceA = makeResource({ resourceId: "res-old", signedUrl: URL_A });
  const resourceB = makeResource({
    resourceId: "res-new",
    signedUrl: URL_B,
    title: "Resource B",
  });

  const reloadFn = async () => null;

  let root: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(
      React.createElement(PublishedHtmlResourceViewer, {
        resource: resourceA,
        onReloadSignedUrl: reloadFn,
      }),
    );
  });
  await act(async () => {
    await tick();
  });

  // fetch A is pending (index 0)
  assert.equal(fm.calls.length, 1, "Fetch A must be initiated");
  assert.equal(fm.calls[0], URL_A, "First fetch must be for resource A");

  // Rerender with resource B — this should cancel A's in-flight request
  const zipBufB = await buildZipBuffer("<h1>Content B</h1>");
  fm.setResponse(1, okResponse(zipBufB));

  await act(async () => {
    root.render(
      React.createElement(PublishedHtmlResourceViewer, {
        resource: resourceB,
        onReloadSignedUrl: reloadFn,
      }),
    );
  });

  // Wait for B's iframe to appear
  await waitFor(() => container.querySelector("iframe") !== null);

  // fetch B should have started (index 1)
  assert.ok(fm.calls.length >= 2, "Fetch B must be initiated after resource change");
  assert.equal(fm.calls[1], URL_B, "Second fetch must be for resource B");

  // Verify B is displayed (iframe exists from InteractiveResourceViewer)
  const iframeAfterB = container.querySelector("iframe")!;
  assert.ok(iframeAfterB, "iframe must exist after B loads successfully");

  // Now try to resolve the stale fetch A — it should be ignored by generation guard
  const zipBufA = await buildZipBuffer("<h1>Stale Content A</h1>");
  await act(async () => {
    fm.resolveCall(0, okResponse(zipBufA));
  });
  await act(async () => {
    await tick(150);
  });

  // UI must still show B, not A
  const iframeAfterStaleA = container.querySelector("iframe");
  assert.ok(iframeAfterStaleA, "iframe must still exist after stale A resolution attempt");
  assert.equal(
    iframeAfterStaleA,
    iframeAfterB,
    "Same iframe element — stale A did NOT replace B's content",
  );

  // Verify the srcdoc still contains B's content, not A's
  const srcdoc = iframeAfterStaleA.getAttribute("srcdoc") ?? "";
  assert.ok(
    !srcdoc.includes("Stale Content A"),
    "Stale A content must NOT appear in the iframe srcdoc",
  );

  await act(async () => {
    root.unmount();
  });
  globalThis.fetch = origFetch;
});
