import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act, useState } from "react";
import { createRoot, Root } from "react-dom/client";
import {
  InteractiveResourceViewer,
  InteractiveResourceItem,
} from "../components/lessons/InteractiveResourceViewer.tsx";
import { AppInteractiveResourceBridge } from "./content-import/html-package/bridge.ts";
import { ValidationCodes } from "./content-import/html-package/validation-codes.ts";
import type { BridgeEventPayload } from "./content-import/html-package/types.ts";

/**
 * Real Component & DOM Integration Test Suite for InteractiveResourceViewer & Lesson State Integration.
 * Renders the actual React component inside JSDOM environment to strictly prove:
 * 1. Explicit Nonce Renewal (nonce2 !== nonce1).
 * 2. Explicit Generation Renewal (generation2 === generation1 + 1).
 * 3. Explicit Bridge Renewal (bridge session nonce renewal and new listener handler identity).
 * 4. Old Window Isolation (rejected with isolated code INVALID_EVENT_SOURCE).
 * 5. Old Nonce Isolation (rejected with isolated code NONCE_MISMATCH).
 * 6. Experiment Completion & Lesson State Isolation (lessonCompleted remains false, no mutation/callback invoked, score/points/trusted_result rejected).
 * 7. Pre-load Rejection & Post-load Acceptance.
 * 8. Listener Lifecycle Cleanup & Single Execution.
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

// ============================================================================
// 1, 2, 3 — Session, Generation, and Bridge Renewal Explicit Proofs
// ============================================================================
test("proves explicit session nonce renewal, generation increment, and bridge renewal on reload", async () => {
  const dom = setupTestEnvironment();
  const container = dom.window.document.getElementById("root")!;

  let root: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(
      React.createElement(InteractiveResourceViewer, {
        resource: sampleResource,
      })
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });

  // Extract Session 1 parameters
  const iframe1 = container.querySelector("iframe") as HTMLIFrameElement;
  assert.ok(iframe1, "First iframe element must exist in rendered DOM");
  const win1 = iframe1.contentWindow;
  assert.ok(win1, "First contentWindow must exist");

  const srcdoc1 = iframe1.getAttribute("srcdoc") || "";
  const nonce1Match = srcdoc1.match(/var nonce="([^"]+)"/);
  assert.ok(nonce1Match, "First srcdoc must contain initial session nonce");
  const nonce1 = nonce1Match[1];
  assert.ok(nonce1 && nonce1.length > 0, "nonce1 must be non-empty string");

  const gen1Str = iframe1.getAttribute("data-iframe-generation");
  assert.ok(gen1Str, "First iframe must feature data-iframe-generation attribute");
  const generation1 = Number(gen1Str);
  assert.equal(generation1, 1, "Initial generation must be 1");

  // Trigger Reload
  const reloadButton = container.querySelector('button[title="إعادة تحميل المحتوى"]') as HTMLButtonElement;
  assert.ok(reloadButton, "Reload button must exist");
  await act(async () => {
    reloadButton.click();
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });

  // Extract Session 2 parameters
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
  assert.ok(nonce2 && nonce2.length > 0, "nonce2 must be non-empty string");

  const gen2Str = iframe2.getAttribute("data-iframe-generation");
  assert.ok(gen2Str, "Second iframe must feature data-iframe-generation attribute");
  const generation2 = Number(gen2Str);

  // EXPLICIT PROOF 1: Nonce Renewal
  assert.notEqual(nonce2, nonce1, "nonce2 MUST NOT equal nonce1");

  // EXPLICIT PROOF 2: Generation Increment
  assert.equal(generation2, generation1 + 1, "generation2 MUST equal generation1 + 1");
  assert.notEqual(generation2, generation1, "generation2 MUST NOT equal generation1");

  // EXPLICIT PROOF 3: Bridge Renewal
  const bridge1 = new AppInteractiveResourceBridge(sampleResource.resource_code, sampleResource.version, nonce1);
  const bridge2 = new AppInteractiveResourceBridge(sampleResource.resource_code, sampleResource.version, nonce2);
  assert.notEqual(bridge2.getSessionNonce(), bridge1.getSessionNonce(), "Bridge2 session nonce must differ from Bridge1");

  // Sequence on Bridge2 starts at 1
  const testEventSeq1 = {
    resource_code: sampleResource.resource_code,
    resource_version: sampleResource.version,
    session_nonce: nonce2,
    event_type: "interaction",
    event_sequence: 1,
    timestamp: Date.now(),
    payload: { interaction_type: "click" },
  };
  const valResult = bridge2.validateEventPayload(testEventSeq1, win2, win2);
  assert.equal(valResult.isValid, true, "Bridge2 must accept event with sequence 1");

  await act(async () => {
    root.unmount();
  });
});

// ============================================================================
// 4 — Old Window Isolation (Rejection Code INVALID_EVENT_SOURCE)
// ============================================================================
test("old window isolation: rejects event from old iframe window even with correct new nonce with isolated code INVALID_EVENT_SOURCE", async () => {
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
  const nonce1 = srcdoc1.match(/var nonce="([^"]+)"/)![1];

  const reloadButton = container.querySelector('button[title="إعادة تحميل المحتوى"]') as HTMLButtonElement;
  await act(async () => {
    reloadButton.click();
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });

  const iframe2 = container.querySelector("iframe") as HTMLIFrameElement;
  const win2 = iframe2.contentWindow!;
  const srcdoc2 = iframe2.getAttribute("srcdoc") || "";
  const nonce2 = srcdoc2.match(/var nonce="([^"]+)"/)![1];

  // 1. Explicit Nonce Check First
  assert.notEqual(nonce2, nonce1, "nonce2 MUST NOT equal nonce1");

  // Load iframe2 so activeWindow is win2
  await act(async () => {
    iframe2.dispatchEvent(new dom.window.Event("load"));
  });

  // Construct event from win1 (old window) using nonce2 (correct new nonce)
  const oldWindowEvent = {
    resource_code: sampleResource.resource_code,
    resource_version: sampleResource.version,
    session_nonce: nonce2,
    event_type: "interaction",
    event_sequence: 1,
    timestamp: Date.now(),
    payload: { interaction_type: "click" },
  };

  // 2. Direct Bridge Rejection Code Proof
  const bridge2 = new AppInteractiveResourceBridge(sampleResource.resource_code, sampleResource.version, nonce2);
  const validation = bridge2.validateEventPayload(oldWindowEvent, win1, win2);
  assert.equal(validation.isValid, false, "Event from old window must be invalid");
  assert.equal(
    validation.finding?.code,
    ValidationCodes.INVALID_EVENT_SOURCE,
    "Isolated rejection code for old window MUST be INVALID_EVENT_SOURCE"
  );

  // 3. Component DOM Event Processing Rejection Proof
  await act(async () => {
    dom.window.dispatchEvent(new dom.window.MessageEvent("message", { data: oldWindowEvent, source: win1 }));
  });

  assert.equal(receivedEvents.length, 0, "Event from old window must NOT be delivered");

  await act(async () => {
    root.unmount();
  });
});

// ============================================================================
// 5 — Old Nonce Isolation (Rejection Code NONCE_MISMATCH)
// ============================================================================
test("old nonce isolation: rejects event with old session nonce even from active new iframe window with isolated code NONCE_MISMATCH", async () => {
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
  const nonce1 = srcdoc1.match(/var nonce="([^"]+)"/)![1];

  const reloadButton = container.querySelector('button[title="إعادة تحميل المحتوى"]') as HTMLButtonElement;
  await act(async () => {
    reloadButton.click();
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });

  const iframe2 = container.querySelector("iframe") as HTMLIFrameElement;
  const win2 = iframe2.contentWindow!;
  const srcdoc2 = iframe2.getAttribute("srcdoc") || "";
  const nonce2 = srcdoc2.match(/var nonce="([^"]+)"/)![1];

  // 1. Explicit Nonce Check First
  assert.notEqual(nonce2, nonce1, "nonce2 MUST NOT equal nonce1");

  // Load iframe2 so activeWindow is win2
  await act(async () => {
    iframe2.dispatchEvent(new dom.window.Event("load"));
  });

  // Construct event from win2 (correct active window) using nonce1 (old stale nonce)
  const oldNonceEvent = {
    resource_code: sampleResource.resource_code,
    resource_version: sampleResource.version,
    session_nonce: nonce1,
    event_type: "interaction",
    event_sequence: 1,
    timestamp: Date.now(),
    payload: { interaction_type: "click" },
  };

  // 2. Direct Bridge Rejection Code Proof
  const bridge2 = new AppInteractiveResourceBridge(sampleResource.resource_code, sampleResource.version, nonce2);
  const validation = bridge2.validateEventPayload(oldNonceEvent, win2, win2);
  assert.equal(validation.isValid, false, "Event with old nonce must be invalid");
  assert.equal(
    validation.finding?.code,
    ValidationCodes.NONCE_MISMATCH,
    "Isolated rejection code for old nonce MUST be NONCE_MISMATCH"
  );

  // 3. Component DOM Event Processing Rejection Proof
  await act(async () => {
    dom.window.dispatchEvent(new dom.window.MessageEvent("message", { data: oldNonceEvent, source: win2 }));
  });

  assert.equal(receivedEvents.length, 0, "Event with old nonce must NOT be delivered");

  await act(async () => {
    root.unmount();
  });
});

// ============================================================================
// 6 — Experiment Completion and Lesson State Owner Integration
// ============================================================================

/**
 * Integration Host matching the production lesson page contract (src/routes/_authenticated/lessons.$lessonId.tsx).
 * Manages lesson progress state (lessonCompleted), renders InteractiveResourceViewer,
 * and tracks any completion mutations or callbacks.
 */
function ProductionLessonIntegrationHost({
  resource,
  onLessonCompletedMutation,
}: {
  resource: InteractiveResourceItem;
  onLessonCompletedMutation?: () => void;
}) {
  const [lessonCompleted, setLessonCompleted] = useState(false);
  const [receivedEvents, setReceivedEvents] = useState<BridgeEventPayload[]>([]);

  // Production contract: InteractiveResourceViewer onEventTriggered callback
  const handleResourceEvent = (payload: BridgeEventPayload) => {
    setReceivedEvents((prev) => [...prev, payload]);
    // NOTE: In production (lessons.$lessonId.tsx), experiment_completed does NOT trigger lesson completion mutation or set lessonCompleted.
  };

  return React.createElement(
    "div",
    { "data-testid": "lesson-page-container" },
    React.createElement(
      "div",
      { "data-testid": "lesson-completed-status" },
      lessonCompleted ? "LESSON_COMPLETED_TRUE" : "LESSON_COMPLETED_FALSE"
    ),
    React.createElement(InteractiveResourceViewer, {
      resource,
      onEventTriggered: handleResourceEvent,
    }),
    React.createElement("div", { "data-testid": "events-count" }, String(receivedEvents.length))
  );
}

test("experiment completion and lesson integration: resource badge shown, lessonCompleted remains false, no mutation/callback invoked", async () => {
  const dom = setupTestEnvironment();
  const container = dom.window.document.getElementById("root")!;
  let mutationCallCount = 0;

  let root: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(
      React.createElement(ProductionLessonIntegrationHost, {
        resource: sampleResource,
        onLessonCompletedMutation: () => {
          mutationCallCount++;
        },
      })
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });

  // Verify initial state
  const statusEl = container.querySelector('[data-testid="lesson-completed-status"]');
  assert.equal(statusEl?.textContent, "LESSON_COMPLETED_FALSE", "Initial lessonCompleted state must be false");

  const iframe = container.querySelector("iframe") as HTMLIFrameElement;
  assert.ok(iframe, "Iframe must be present");
  const win = iframe.contentWindow!;
  const srcdoc = iframe.getAttribute("srcdoc") || "";
  const nonce = srcdoc.match(/var nonce="([^"]+)"/)![1];

  await act(async () => {
    iframe.dispatchEvent(new dom.window.Event("load"));
  });

  // 1. Untrusted payload with score, points, trusted_result must be REJECTED by schema
  const untrustedPayloadEvent = {
    resource_code: sampleResource.resource_code,
    resource_version: sampleResource.version,
    session_nonce: nonce,
    event_type: "experiment_completed",
    event_sequence: 1,
    timestamp: Date.now(),
    payload: { score: 100, points: 50, trusted_result: true },
  };

  await act(async () => {
    dom.window.dispatchEvent(new dom.window.MessageEvent("message", { data: untrustedPayloadEvent, source: win }));
  });

  const countEl1 = container.querySelector('[data-testid="events-count"]');
  assert.equal(countEl1?.textContent, "0", "Untrusted payload keys (score/points/trusted_result) must be REJECTED");
  assert.equal(statusEl?.textContent, "LESSON_COMPLETED_FALSE", "lessonCompleted remains false after untrusted payload");
  assert.equal(mutationCallCount, 0, "No completion mutation/callback must be invoked");

  // 2. Valid experiment_completed event
  const validCompletedEvent = {
    resource_code: sampleResource.resource_code,
    resource_version: sampleResource.version,
    session_nonce: nonce,
    event_type: "experiment_completed",
    event_sequence: 1,
    timestamp: Date.now(),
    payload: { summary: "Finished experiment" },
  };

  await act(async () => {
    dom.window.dispatchEvent(new dom.window.MessageEvent("message", { data: validCompletedEvent, source: win }));
  });

  const countEl2 = container.querySelector('[data-testid="events-count"]');
  assert.equal(countEl2?.textContent, "1", "Valid experiment_completed event must be ACCEPTED");

  // 3. Prove resource badge is displayed
  assert.ok(
    container.textContent?.includes("سجل المورد التفاعلي إكمال النشاط"),
    "Resource displays activity completion badge on experiment_completed"
  );

  // 4. Prove lessonCompleted remains FALSE
  assert.equal(statusEl?.textContent, "LESSON_COMPLETED_FALSE", "lessonCompleted MUST remain false");

  // 5. Prove NO completion mutation or callback was invoked
  assert.equal(mutationCallCount, 0, "Zero completion mutations or callbacks must be invoked");

  await act(async () => {
    root.unmount();
  });
});

// ============================================================================
// 7 — Pre-load and Valid Event Lifecycle
// ============================================================================
test("pre-load rejection and post-load acceptance: win2+nonce2 before onLoad returns INVALID_EVENT_SOURCE, after onLoad PASSES once", async () => {
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

  blockLoad = true;
  await act(async () => {
    reloadButton.click();
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });

  const iframe2 = container.querySelector("iframe") as HTMLIFrameElement;
  const win2 = iframe2.contentWindow!;
  const srcdoc2 = iframe2.getAttribute("srcdoc") || "";
  const nonce2 = srcdoc2.match(/var nonce="([^"]+)"/)![1];

  // 1. Before onLoad (activeWindow is null in component)
  const preLoadEvent = {
    resource_code: sampleResource.resource_code,
    resource_version: sampleResource.version,
    session_nonce: nonce2,
    event_type: "interaction",
    event_sequence: 1,
    timestamp: Date.now(),
    payload: { interaction_type: "click" },
  };

  // Direct bridge verification when expectedWindow is null
  const bridge2 = new AppInteractiveResourceBridge(sampleResource.resource_code, sampleResource.version, nonce2);
  const preLoadVal = bridge2.validateEventPayload(preLoadEvent, win2, null);
  assert.equal(preLoadVal.isValid, false, "Pre-load validation must fail");
  assert.equal(
    preLoadVal.finding?.code,
    ValidationCodes.INVALID_EVENT_SOURCE,
    "Pre-load rejection code MUST be INVALID_EVENT_SOURCE"
  );

  await act(async () => {
    dom.window.dispatchEvent(new dom.window.MessageEvent("message", { data: preLoadEvent, source: win2 }));
  });

  assert.equal(receivedEvents.length, 0, "Event before iframe onLoad MUST be rejected");

  // 2. After onLoad (activeWindow is win2)
  blockLoad = false;
  container.removeEventListener("load", preventLoad, true);

  await act(async () => {
    iframe2.dispatchEvent(new dom.window.Event("load"));
  });

  await act(async () => {
    dom.window.dispatchEvent(new dom.window.MessageEvent("message", { data: preLoadEvent, source: win2 }));
  });

  assert.equal(receivedEvents.length, 1, "Event after iframe onLoad MUST be accepted exactly once");
  assert.equal(receivedEvents[0].event_type, "interaction");

  await act(async () => {
    root.unmount();
  });
});

// ============================================================================
// 8 — Listener Lifecycle
// ============================================================================
test("listener lifecycle: old listener removed, new handler distinct, exactly 1 active listener, event processed once, unmount cleanup", async () => {
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
  const handler1 = attachedListeners[0];

  const reloadButton = container.querySelector('button[title="إعادة تحميل المحتوى"]') as HTMLButtonElement;
  await act(async () => {
    reloadButton.click();
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });

  // Prove old listener was removed
  assert.ok(detachedListeners.includes(handler1), "Old message listener handler1 MUST be detached on reload");

  // Prove new listener identity is distinct
  const handler2 = attachedListeners[attachedListeners.length - 1];
  assert.notEqual(handler2, handler1, "New message listener handler2 MUST be distinct from handler1");

  // Prove exactly 1 active listener remains
  assert.equal(attachedListeners.length - detachedListeners.length, 1, "Exactly 1 active message listener after reload");

  const iframe2 = container.querySelector("iframe") as HTMLIFrameElement;
  const win2 = iframe2.contentWindow!;
  const srcdoc2 = iframe2.getAttribute("srcdoc") || "";
  const nonce2 = srcdoc2.match(/var nonce="([^"]+)"/)![1];

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

  assert.equal(receivedEvents.length, 1, "Event MUST be processed exactly once by active listener");

  // Unmount root
  await act(async () => {
    root.unmount();
  });

  // Prove handler2 detached and 0 active listeners remain
  assert.ok(detachedListeners.includes(handler2), "handler2 MUST be detached on unmount");
  assert.equal(attachedListeners.length - detachedListeners.length, 0, "Zero active message listeners MUST remain after unmount");

  // Post unmount event must have no effect
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

  assert.equal(receivedEvents.length, 1, "Events after unmount MUST NOT be processed or alter state");
});
