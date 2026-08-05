import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import {
  InteractiveResourceViewer,
  InteractiveResourceItem,
} from "../components/lessons/InteractiveResourceViewer.tsx";
import type { BridgeEventPayload } from "./content-import/html-package/types.ts";

/**
 * Real Component & DOM Integration Test for InteractiveResourceViewer
 * Renders the actual React component inside a JSDOM environment to prove:
 * 1. Physical iframe DOM element unmount/remount on reload.
 * 2. New contentWindowProxy isolation.
 * 3. Session nonce generation and renewal.
 * 4. Pre-load fail-closed rejection.
 * 5. Stale contentWindow and stale nonce event rejection.
 * 6. Valid event acceptance after load.
 * 7. Message listener lifecycle cleanup (removeEventListener on state change, reload & unmount).
 */

function setupTestEnvironment() {
  const dom = new JSDOM("<!DOCTYPE html><html><body><div id='root'></div></body></html>", {
    url: "http://localhost/",
    runScripts: "dangerously",
    resources: "usable",
  });

  const win = dom.window;

  (globalThis as any).window = win;
  (globalThis as any).document = win.document;
  (globalThis as any).HTMLElement = win.HTMLElement;
  (globalThis as any).HTMLIFrameElement = win.HTMLIFrameElement;
  (globalThis as any).MessageEvent = win.MessageEvent;
  (globalThis as any).Event = win.Event;
  (globalThis as any).CustomEvent = win.CustomEvent;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

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
    (win as any).crypto = globalThis.crypto;
  }

  return dom;
}

const sampleResource: InteractiveResourceItem = {
  id: "res-test-1",
  resource_code: "RES-TEST-RELOAD-01",
  resource_type: "practical_experiment_html",
  title_ar: "تجربة ريلود تفاعلية",
  description_ar: "وصف تجربة تفاعلية لاختبار المكون الحقيقي",
  version: 1,
  entry_file: "index.html",
  html_content: "<!DOCTYPE html><html><head><title>Test</title></head><body><h1>Interactive Content</h1></body></html>",
  offline_enabled: true,
};

test("56. InteractiveResourceViewer Real Component Integration: DOM iframe remount, contentWindow isolation, nonce renewal, listener lifecycle & stale rejection", async () => {
  // Step 1: Create test DOM environment
  const dom = setupTestEnvironment();
  const container = dom.window.document.getElementById("root")!;

  // Track message event listener registrations on window
  const attachedListeners: Function[] = [];
  const detachedListeners: Function[] = [];

  const originalAddEventListener = dom.window.addEventListener.bind(dom.window);
  const originalRemoveEventListener = dom.window.removeEventListener.bind(dom.window);

  dom.window.addEventListener = (type: string, listener: any, options?: any) => {
    if (type === "message") {
      attachedListeners.push(listener);
    }
    return originalAddEventListener(type, listener, options);
  };

  dom.window.removeEventListener = (type: string, listener: any, options?: any) => {
    if (type === "message") {
      detachedListeners.push(listener);
    }
    return originalRemoveEventListener(type, listener, options);
  };

  const receivedEvents: BridgeEventPayload[] = [];
  const handleEventTriggered = (payload: BridgeEventPayload) => {
    receivedEvents.push(payload);
  };

  // Step 2: Render actual React Component
  let root: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(
      React.createElement(InteractiveResourceViewer, {
        resource: sampleResource,
        onEventTriggered: handleEventTriggered,
      })
    );
  });

  // Wait for async CSP bundle building and setSrcDoc state update
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });

  // Step 3: Extract first iframe element
  const iframe1 = container.querySelector("iframe") as HTMLIFrameElement;
  assert.ok(iframe1, "First iframe element must exist in rendered DOM");

  const win1 = iframe1.contentWindow;
  assert.ok(win1, "First contentWindow must exist");

  const srcdoc1 = iframe1.getAttribute("srcdoc") || "";
  const nonce1Match = srcdoc1.match(/var nonce="([^"]+)"/);
  assert.ok(nonce1Match, "srcdoc must contain injected session nonce");
  const nonce1 = nonce1Match[1];
  assert.ok(nonce1.length > 0, "Initial nonce must be non-empty string");

  // Verify active message listener on window
  assert.equal(attachedListeners.length - detachedListeners.length, 1, "Exactly 1 net message listener must be active on mount");

  // Step 4: Trigger onLoad for iframe1 and bind contentWindow1
  await act(async () => {
    iframe1.dispatchEvent(new dom.window.Event("load"));
  });

  // Step 5 & 6: Send valid MessageEvent from iframe 1 -> ACCEPT
  const validEvent1 = {
    resource_code: "RES-TEST-RELOAD-01",
    resource_version: 1,
    session_nonce: nonce1,
    event_type: "resource_ready",
    event_sequence: 1,
    timestamp: Date.now(),
    payload: {},
  };
  await act(async () => {
    dom.window.dispatchEvent(new dom.window.MessageEvent("message", { data: validEvent1, source: win1 }));
  });
  assert.equal(receivedEvents.length, 1, "Valid event from first window after onLoad must be ACCEPTED");
  assert.equal(receivedEvents[0].event_type, "resource_ready");

  const detachCountBeforeReload = detachedListeners.length;

  // Step 7: Click Reload button from DOM
  const reloadButton = container.querySelector('button[title="إعادة تحميل المحتوى"]') as HTMLButtonElement;
  assert.ok(reloadButton, "Reload button must exist in rendered Component DOM");

  await act(async () => {
    reloadButton.click();
  });

  // Step 15 & 16: Send Event BEFORE onLoad for new session window -> REJECT fail-closed (activeWindow is reset to null during reload)
  const preLoadEvent2 = {
    resource_code: "RES-TEST-RELOAD-01",
    resource_version: 1,
    session_nonce: "pre-load-nonce-attempt",
    event_type: "interaction",
    event_sequence: 1,
    timestamp: Date.now(),
    payload: { interaction_type: "click" },
  };
  await act(async () => {
    dom.window.dispatchEvent(new dom.window.MessageEvent("message", { data: preLoadEvent2, source: win1 }));
  });
  assert.equal(receivedEvents.length, 1, "Event before new iframe onLoad must be REJECTED fail-closed");

  // Step 8: Wait for React update (generation 2 session creation and srcDoc bundle build)
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });

  // Section 3 proof: Listener detach on reload
  assert.ok(detachedListeners.length > detachCountBeforeReload, "Old message listener must be detached via removeEventListener on reload");
  assert.equal(attachedListeners.length - detachedListeners.length, 1, "Exactly 1 net message listener must be active after reload");

  // Step 9: Extract new iframe element
  const iframe2 = container.querySelector("iframe") as HTMLIFrameElement;
  assert.ok(iframe2, "Second iframe element must exist in rendered DOM after reload");

  // Step 10: Prove element remount, contentWindow isolation, generation change, and nonce renewal
  assert.notEqual(iframe2, iframe1, "New iframe DOM element must be physically recreated (iframe2 !== iframe1)");

  const win2 = iframe2.contentWindow;
  assert.notEqual(win2, win1, "New contentWindow must differ from old contentWindow (win2 !== win1)");

  const srcdoc2 = iframe2.getAttribute("srcdoc") || "";
  const nonce2Match = srcdoc2.match(/var nonce="([^"]+)"/);
  assert.ok(nonce2Match, "Generation 2 srcdoc must contain new session nonce");
  const nonce2 = nonce2Match[1];
  assert.notEqual(nonce2, nonce1, "New session nonce (nonce2) must differ from old nonce (nonce1)");

  // Step 11 & 12: Send Event from old window (win1) -> REJECT
  const oldWindowEvent = {
    resource_code: "RES-TEST-RELOAD-01",
    resource_version: 1,
    session_nonce: nonce2,
    event_type: "interaction",
    event_sequence: 1,
    timestamp: Date.now(),
    payload: { interaction_type: "click" },
  };
  await act(async () => {
    dom.window.dispatchEvent(new dom.window.MessageEvent("message", { data: oldWindowEvent, source: win1 }));
  });
  assert.equal(receivedEvents.length, 1, "Event from old contentWindow (win1) must be REJECTED");

  // Step 13 & 14: Send Event with old nonce (nonce1) from new window (win2) -> REJECT
  const oldNonceEvent = {
    resource_code: "RES-TEST-RELOAD-01",
    resource_version: 1,
    session_nonce: nonce1,
    event_type: "interaction",
    event_sequence: 1,
    timestamp: Date.now(),
    payload: { interaction_type: "click" },
  };
  await act(async () => {
    dom.window.dispatchEvent(new dom.window.MessageEvent("message", { data: oldNonceEvent, source: win2 }));
  });
  assert.equal(receivedEvents.length, 1, "Event with old nonce (nonce1) from new window must be REJECTED");

  // Step 17: Trigger onLoad for new window (iframe2)
  await act(async () => {
    iframe2.dispatchEvent(new dom.window.Event("load"));
  });

  // Step 18 & 19: Send valid Event from new window (win2) and new nonce (nonce2) -> ACCEPT
  const validEvent2 = {
    resource_code: "RES-TEST-RELOAD-01",
    resource_version: 1,
    session_nonce: nonce2,
    event_type: "interaction",
    event_sequence: 1,
    timestamp: Date.now(),
    payload: { interaction_type: "click" },
  };
  await act(async () => {
    dom.window.dispatchEvent(new dom.window.MessageEvent("message", { data: validEvent2, source: win2 }));
  });
  assert.equal(receivedEvents.length, 2, "Valid event from new window with new nonce after onLoad must be ACCEPTED");
  assert.equal(receivedEvents[1].event_type, "interaction");

  // Step 20 & Section 3: Old session listener removed, no duplicate handlers, unmount cleanup
  await act(async () => {
    root.unmount();
  });

  assert.equal(attachedListeners.length - detachedListeners.length, 0, "No active message listeners must remain after Component unmount");

  // Dispatched events after unmount must NOT be processed
  const postUnmountEvent = {
    resource_code: "RES-TEST-RELOAD-01",
    resource_version: 1,
    session_nonce: nonce2,
    event_type: "experiment_completed",
    event_sequence: 2,
    timestamp: Date.now(),
    payload: {},
  };
  await act(async () => {
    dom.window.dispatchEvent(new dom.window.MessageEvent("message", { data: postUnmountEvent, source: win2 }));
  });
  assert.equal(receivedEvents.length, 2, "Events dispatched after Component unmount must not be processed");
});
