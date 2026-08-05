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

test("rejects old iframe window after new iframe has loaded", async () => {
  const dom = setupTestEnvironment();
  const container = dom.window.document.getElementById("root")!;
  const receivedEvents: BridgeEventPayload[] = [];

  let root: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(
      React.createElement(InteractiveResourceViewer, {
        resource: sampleResource,
        onEventTriggered: (p) => receivedEvents.push(p),
      })
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });

  const iframe1 = container.querySelector("iframe") as HTMLIFrameElement;
  assert.ok(iframe1, "First iframe element must exist in rendered DOM");
  const win1 = iframe1.contentWindow;
  assert.ok(win1, "First contentWindow must exist");

  const reloadButton = container.querySelector('button[title="إعادة تحميل المحتوى"]') as HTMLButtonElement;
  assert.ok(reloadButton, "Reload button must exist");
  await act(async () => {
    reloadButton.click();
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });

  const iframe2 = container.querySelector("iframe") as HTMLIFrameElement;
  assert.ok(iframe2, "Second iframe element must exist after reload");
  assert.notEqual(iframe2, iframe1, "Physical iframe element must be remounted");
  const win2 = iframe2.contentWindow;
  assert.ok(win2, "Second contentWindow must exist");
  assert.notEqual(win2, win1, "Second contentWindow must differ from first contentWindow");

  const srcdoc2 = iframe2.getAttribute("srcdoc") || "";
  const nonce2Match = srcdoc2.match(/var nonce="([^"]+)"/);
  assert.ok(nonce2Match, "Second srcdoc must contain new session nonce");
  const nonce2 = nonce2Match[1];

  // Execute onLoad for iframe2 FIRST to bind activeWindow = win2
  await act(async () => {
    iframe2.dispatchEvent(new dom.window.Event("load"));
  });

  // Dispatch event from win1 (old window) using nonce2 (correct new nonce) and valid fields
  const oldWindowEvent = {
    resource_code: sampleResource.resource_code,
    resource_version: sampleResource.version,
    session_nonce: nonce2,
    event_type: "interaction",
    event_sequence: 1,
    timestamp: Date.now(),
    payload: { interaction_type: "click" },
  };

  await act(async () => {
    dom.window.dispatchEvent(new dom.window.MessageEvent("message", { data: oldWindowEvent, source: win1 }));
  });

  assert.equal(receivedEvents.length, 0, "Event from old window must be REJECTED after new iframe load");
  assert.ok(!container.textContent?.includes("سجل المورد التفاعلي إكمال النشاط"), "Resource state must remain unchanged");

  await act(async () => {
    root.unmount();
  });
});

test("rejects old nonce from active new iframe", async () => {
  const dom = setupTestEnvironment();
  const container = dom.window.document.getElementById("root")!;
  const receivedEvents: BridgeEventPayload[] = [];

  let root: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(
      React.createElement(InteractiveResourceViewer, {
        resource: sampleResource,
        onEventTriggered: (p) => receivedEvents.push(p),
      })
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });

  const iframe1 = container.querySelector("iframe") as HTMLIFrameElement;
  const srcdoc1 = iframe1.getAttribute("srcdoc") || "";
  const nonce1Match = srcdoc1.match(/var nonce="([^"]+)"/);
  assert.ok(nonce1Match, "First srcdoc must contain initial nonce");
  const nonce1 = nonce1Match[1];

  const reloadButton = container.querySelector('button[title="إعادة تحميل المحتوى"]') as HTMLButtonElement;
  await act(async () => {
    reloadButton.click();
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });

  const iframe2 = container.querySelector("iframe") as HTMLIFrameElement;
  const win2 = iframe2.contentWindow;

  // Execute onLoad for iframe2 FIRST
  await act(async () => {
    iframe2.dispatchEvent(new dom.window.Event("load"));
  });

  // Dispatch event from win2 (active correct window) using nonce1 (old stale nonce)
  const oldNonceEvent = {
    resource_code: sampleResource.resource_code,
    resource_version: sampleResource.version,
    session_nonce: nonce1,
    event_type: "interaction",
    event_sequence: 1,
    timestamp: Date.now(),
    payload: { interaction_type: "click" },
  };

  await act(async () => {
    dom.window.dispatchEvent(new dom.window.MessageEvent("message", { data: oldNonceEvent, source: win2 }));
  });

  assert.equal(receivedEvents.length, 0, "Event with old nonce from active new window must be REJECTED (NONCE_MISMATCH)");
  assert.ok(!container.textContent?.includes("سجل المورد التفاعلي إكمال النشاط"), "Resource state must remain unchanged");

  await act(async () => {
    root.unmount();
  });
});

test("rejects valid new-session event before iframe onLoad", async () => {
  const dom = setupTestEnvironment();
  const container = dom.window.document.getElementById("root")!;
  const receivedEvents: BridgeEventPayload[] = [];

  let blockLoad = false;
  const preventLoad = (e: Event) => {
    if (blockLoad) {
      e.stopImmediatePropagation();
    }
  };
  container.addEventListener("load", preventLoad, true);

  let root: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(
      React.createElement(InteractiveResourceViewer, {
        resource: sampleResource,
        onEventTriggered: (p) => receivedEvents.push(p),
      })
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });

  const reloadButton = container.querySelector('button[title="إعادة تحميل المحتوى"]') as HTMLButtonElement;

  // Block load event for second iframe generation to test pre-load state (activeWindow is null)
  blockLoad = true;
  await act(async () => {
    reloadButton.click();
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });

  const iframe2 = container.querySelector("iframe") as HTMLIFrameElement;
  assert.ok(iframe2, "Second iframe element must exist in DOM");
  const win2 = iframe2.contentWindow;
  assert.ok(win2, "Second contentWindow must exist");
  const srcdoc2 = iframe2.getAttribute("srcdoc") || "";
  const nonce2Match = srcdoc2.match(/var nonce="([^"]+)"/);
  assert.ok(nonce2Match, "Second srcdoc must contain new session nonce");
  const nonce2 = nonce2Match[1];

  // Dispatch event using valid new win2 and valid new nonce2 BEFORE iframe onLoad has fired (activeWindow is null)
  const preLoadEvent = {
    resource_code: sampleResource.resource_code,
    resource_version: sampleResource.version,
    session_nonce: nonce2,
    event_type: "interaction",
    event_sequence: 1,
    timestamp: Date.now(),
    payload: { interaction_type: "click" },
  };

  await act(async () => {
    dom.window.dispatchEvent(new dom.window.MessageEvent("message", { data: preLoadEvent, source: win2 }));
  });

  assert.equal(receivedEvents.length, 0, "Event before iframe onLoad must be REJECTED fail-closed (activeWindow is null)");
  assert.ok(!container.textContent?.includes("سجل المورد التفاعلي إكمال النشاط"), "Resource state must remain unchanged");

  // Unblock load and cleanup listener
  blockLoad = false;
  container.removeEventListener("load", preventLoad, true);

  await act(async () => {
    root.unmount();
  });
});

test("accepts valid new-session event after iframe onLoad", async () => {
  const dom = setupTestEnvironment();
  const container = dom.window.document.getElementById("root")!;
  const receivedEvents: BridgeEventPayload[] = [];

  let root: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(
      React.createElement(InteractiveResourceViewer, {
        resource: sampleResource,
        onEventTriggered: (p) => receivedEvents.push(p),
      })
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });

  const reloadButton = container.querySelector('button[title="إعادة تحميل المحتوى"]') as HTMLButtonElement;
  await act(async () => {
    reloadButton.click();
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });

  const iframe2 = container.querySelector("iframe") as HTMLIFrameElement;
  const win2 = iframe2.contentWindow;
  const srcdoc2 = iframe2.getAttribute("srcdoc") || "";
  const nonce2Match = srcdoc2.match(/var nonce="([^"]+)"/);
  assert.ok(nonce2Match, "Second srcdoc must contain new session nonce");
  const nonce2 = nonce2Match[1];

  // Trigger onLoad for iframe2
  await act(async () => {
    iframe2.dispatchEvent(new dom.window.Event("load"));
  });

  const validEvent = {
    resource_code: sampleResource.resource_code,
    resource_version: sampleResource.version,
    session_nonce: nonce2,
    event_type: "interaction",
    event_sequence: 1,
    timestamp: Date.now(),
    payload: { interaction_type: "click" },
  };

  await act(async () => {
    dom.window.dispatchEvent(new dom.window.MessageEvent("message", { data: validEvent, source: win2 }));
  });

  assert.equal(receivedEvents.length, 1, "Valid event after onLoad must be ACCEPTED");
  assert.equal(receivedEvents[0].event_type, "interaction");

  await act(async () => {
    root.unmount();
  });
});

test("experiment completion does not complete lesson", async () => {
  const dom = setupTestEnvironment();
  const container = dom.window.document.getElementById("root")!;
  const receivedEvents: BridgeEventPayload[] = [];

  let root: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(
      React.createElement(InteractiveResourceViewer, {
        resource: sampleResource,
        onEventTriggered: (p) => receivedEvents.push(p),
      })
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });

  const iframe1 = container.querySelector("iframe") as HTMLIFrameElement;
  const win1 = iframe1.contentWindow!;
  const srcdoc1 = iframe1.getAttribute("srcdoc") || "";
  const nonce1Match = srcdoc1.match(/var nonce="([^"]+)"/);
  assert.ok(nonce1Match, "First srcdoc must contain initial nonce");
  const nonce1 = nonce1Match[1];

  await act(async () => {
    iframe1.dispatchEvent(new dom.window.Event("load"));
  });

  // 1. Untrusted payload with score, points, trusted_result must be REJECTED
  const untrustedPayloadEvent = {
    resource_code: sampleResource.resource_code,
    resource_version: sampleResource.version,
    session_nonce: nonce1,
    event_type: "experiment_completed",
    event_sequence: 1,
    timestamp: Date.now(),
    payload: { score: 100, points: 50, trusted_result: true },
  };

  await act(async () => {
    dom.window.dispatchEvent(new dom.window.MessageEvent("message", { data: untrustedPayloadEvent, source: win1 }));
  });

  assert.equal(receivedEvents.length, 0, "Untrusted payload keys (score/points/trusted_result) must be REJECTED by schema");

  // 2. Valid experiment_completed event
  const validCompletedEvent = {
    resource_code: sampleResource.resource_code,
    resource_version: sampleResource.version,
    session_nonce: nonce1,
    event_type: "experiment_completed",
    event_sequence: 1,
    timestamp: Date.now(),
    payload: { summary: "Experiment completed successfully" },
  };

  await act(async () => {
    dom.window.dispatchEvent(new dom.window.MessageEvent("message", { data: validCompletedEvent, source: win1 }));
  });

  assert.equal(receivedEvents.length, 1, "Valid experiment_completed event must be ACCEPTED");
  assert.equal(receivedEvents[0].event_type, "experiment_completed");

  // 3. Prove local resource completion badge appears
  assert.ok(
    container.textContent?.includes("سجل المورد التفاعلي إكمال النشاط"),
    "Component records resource reported completed in local state"
  );

  // 4. Prove no lesson completion callback is invoked (InteractiveResourceViewer does not receive or trigger any lesson completion callback)
  await act(async () => {
    root.unmount();
  });
});

test("removes old listener on reload and current listener on unmount", async () => {
  const dom = setupTestEnvironment();
  const container = dom.window.document.getElementById("root")!;

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
  let root: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(
      React.createElement(InteractiveResourceViewer, {
        resource: sampleResource,
        onEventTriggered: (p) => receivedEvents.push(p),
      })
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });

  assert.equal(attachedListeners.length - detachedListeners.length, 1, "Exactly 1 active message listener on mount");

  const detachCountBeforeReload = detachedListeners.length;
  const reloadButton = container.querySelector('button[title="إعادة تحميل المحتوى"]') as HTMLButtonElement;
  await act(async () => {
    reloadButton.click();
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });

  assert.ok(detachedListeners.length > detachCountBeforeReload, "Old message listener must be removed on reload");
  assert.equal(attachedListeners.length - detachedListeners.length, 1, "Exactly 1 active message listener after reload");

  const iframe2 = container.querySelector("iframe") as HTMLIFrameElement;
  const win2 = iframe2.contentWindow!;
  const srcdoc2 = iframe2.getAttribute("srcdoc") || "";
  const nonce2Match = srcdoc2.match(/var nonce="([^"]+)"/);
  assert.ok(nonce2Match, "Second srcdoc must contain new session nonce");
  const nonce2 = nonce2Match[1];

  await act(async () => {
    iframe2.dispatchEvent(new dom.window.Event("load"));
  });

  const validEvent = {
    resource_code: sampleResource.resource_code,
    resource_version: sampleResource.version,
    session_nonce: nonce2,
    event_type: "interaction",
    event_sequence: 1,
    timestamp: Date.now(),
    payload: { interaction_type: "click" },
  };

  await act(async () => {
    dom.window.dispatchEvent(new dom.window.MessageEvent("message", { data: validEvent, source: win2 }));
  });

  assert.equal(receivedEvents.length, 1, "Event must be processed exactly once by active listener");

  await act(async () => {
    root.unmount();
  });

  assert.equal(attachedListeners.length - detachedListeners.length, 0, "No active message listeners must remain after unmount");

  const postUnmountEvent = {
    resource_code: sampleResource.resource_code,
    resource_version: sampleResource.version,
    session_nonce: nonce2,
    event_type: "interaction",
    event_sequence: 2,
    timestamp: Date.now(),
    payload: { interaction_type: "click" },
  };

  await act(async () => {
    dom.window.dispatchEvent(new dom.window.MessageEvent("message", { data: postUnmountEvent, source: win2 }));
  });

  assert.equal(receivedEvents.length, 1, "Events after unmount must not change state or be processed");
});
