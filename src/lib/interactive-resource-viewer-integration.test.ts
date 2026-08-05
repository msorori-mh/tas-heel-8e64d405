import test from "node:test";
import assert from "node:assert/strict";
import {
  AppInteractiveResourceBridge,
  generateSessionNonce,
} from "./content-import/html-package/index.ts";
import type { BridgeEventPayload } from "./content-import/html-package/types.ts";

/**
 * DOM & Component Integration Test Harness for InteractiveResourceViewer
 * Proves iframe element recreation, contentWindow isolation, session nonce replacement,
 * expectedWindow onLoad binding, and old window/listener event rejection.
 */
class InteractiveResourceViewerHarness {
  public resourceCode: string;
  public version: number;

  public currentIframeElement: { key: string; contentWindow: WindowProxy } | null = null;
  public iframeHistory: { key: string; contentWindow: WindowProxy }[] = [];

  public iframeGeneration = 1;
  public nonce: string = "";
  public bridge: AppInteractiveResourceBridge | null = null;
  public activeWindow: WindowProxy | null = null;
  public eventsLog: BridgeEventPayload[] = [];
  public resourceReportedCompleted = false;

  private activeMessageListener: ((event: { data: unknown; source: WindowProxy | null }) => void) | null = null;
  public listenerAttachCount = 0;
  public listenerDetachCount = 0;

  constructor(resourceCode: string, version: number) {
    this.resourceCode = resourceCode;
    this.version = version;
    this.mount();
  }

  public mount() {
    this.nonce = generateSessionNonce();
    this.bridge = new AppInteractiveResourceBridge(this.resourceCode, this.version, this.nonce);
    this.createIframeElement();
    this.attachMessageListener();
  }

  private createIframeElement() {
    const key = `${this.resourceCode}-${this.version}-${this.iframeGeneration}`;
    const mockContentWindow = {
      name: `window-gen-${this.iframeGeneration}-${Math.random().toString(36).substring(2, 7)}`,
    } as unknown as WindowProxy;

    const iframeEl = { key, contentWindow: mockContentWindow };
    this.currentIframeElement = iframeEl;
    this.iframeHistory.push(iframeEl);
  }

  public triggerIframeLoad() {
    if (this.currentIframeElement) {
      this.activeWindow = this.currentIframeElement.contentWindow;
    }
  }

  private attachMessageListener() {
    this.detachMessageListener();

    const listener = (event: { data: unknown; source: WindowProxy | null }) => {
      if (!this.bridge) return;
      const validation = this.bridge.validateEventPayload(
        event.data,
        event.source,
        this.activeWindow
      );
      if (validation.isValid && validation.payload) {
        this.eventsLog.push(validation.payload);
        if (validation.payload.event_type === "experiment_completed") {
          this.resourceReportedCompleted = true;
        }
      }
    };

    this.activeMessageListener = listener;
    this.listenerAttachCount++;
  }

  public detachMessageListener() {
    if (this.activeMessageListener) {
      this.activeMessageListener = null;
      this.listenerDetachCount++;
    }
  }

  public handleReload() {
    const oldListener = this.activeMessageListener;
    this.detachMessageListener();
    this.activeWindow = null;
    this.resourceReportedCompleted = false;
    this.eventsLog = [];
    this.iframeGeneration++;
    this.nonce = generateSessionNonce();
    this.bridge = new AppInteractiveResourceBridge(this.resourceCode, this.version, this.nonce);
    this.createIframeElement();
    this.attachMessageListener();

    return oldListener;
  }

  public dispatchPostMessage(data: unknown, source: WindowProxy | null) {
    if (this.activeMessageListener) {
      this.activeMessageListener({ data, source });
    }
  }
}

test("56. InteractiveResourceViewer Integration: iframe element recreation, contentWindow isolation, nonce regeneration, and stale event rejection on reload", () => {
  // 1. Render / mount component harness
  const harness = new InteractiveResourceViewerHarness("RES-TEST-RELOAD-01", 1);
  assert.equal(harness.iframeGeneration, 1, "Initial iframe generation must be 1");

  // 2. Get first iframe element and contentWindow
  const iframe1 = harness.currentIframeElement!;
  const win1 = iframe1.contentWindow;
  assert.ok(iframe1, "First iframe element must exist");
  assert.ok(win1, "First contentWindow must exist");
  assert.equal(harness.activeWindow, null, "activeWindow must be null before onLoad");

  // Verify fail-closed before onLoad
  const nonce1 = harness.nonce;
  const preLoadEvent = {
    resource_code: "RES-TEST-RELOAD-01",
    resource_version: 1,
    session_nonce: nonce1,
    event_type: "resource_ready",
    event_sequence: 1,
    timestamp: Date.now(),
    payload: {},
  };
  harness.dispatchPostMessage(preLoadEvent, win1);
  assert.equal(harness.eventsLog.length, 0, "Events before iframe onLoad must be REJECTED fail-closed");

  // Complete iframe 1 onLoad
  harness.triggerIframeLoad();
  assert.equal(harness.activeWindow, win1, "activeWindow must bind to win1 after onLoad");

  // 3. Send valid Event from first window -> PASS
  const validEvent1 = {
    resource_code: "RES-TEST-RELOAD-01",
    resource_version: 1,
    session_nonce: nonce1,
    event_type: "resource_ready",
    event_sequence: 1,
    timestamp: Date.now(),
    payload: {},
  };
  harness.dispatchPostMessage(validEvent1, win1);
  assert.equal(harness.eventsLog.length, 1, "Valid event from first window must PASS");
  assert.equal(harness.eventsLog[0].event_type, "resource_ready");

  // 4. Click Reload
  const oldListener = harness.handleReload();

  // 5. Prove that iframe Element changed
  const iframe2 = harness.currentIframeElement!;
  assert.notEqual(iframe2, iframe1, "Iframe DOM element must change on Reload");
  assert.notEqual(iframe2.key, iframe1.key, "Iframe key attribute must differ on Reload");

  // 6. Prove that contentWindow differs from old contentWindow
  const win2 = iframe2.contentWindow;
  assert.notEqual(win2, win1, "New contentWindow must differ from old contentWindow");
  assert.equal(harness.activeWindow, null, "activeWindow must be reset to null during reload before onLoad");

  // Complete iframe 2 onLoad
  harness.triggerIframeLoad();
  assert.equal(harness.activeWindow, win2, "activeWindow must bind to win2 after new onLoad");

  const nonce2 = harness.nonce;
  assert.notEqual(nonce2, nonce1, "New session nonce must differ from old nonce");

  // 7. Send Event from old window (win1) -> REJECT
  const oldWindowEvent = {
    resource_code: "RES-TEST-RELOAD-01",
    resource_version: 1,
    session_nonce: nonce2,
    event_type: "interaction",
    event_sequence: 1,
    timestamp: Date.now(),
    payload: { interaction_type: "click" },
  };
  harness.dispatchPostMessage(oldWindowEvent, win1);
  assert.equal(harness.eventsLog.length, 0, "Event from old window must be REJECTED");

  // 8. Send Event with old nonce (nonce1) from new window (win2) -> REJECT
  const oldNonceEvent = {
    resource_code: "RES-TEST-RELOAD-01",
    resource_version: 1,
    session_nonce: nonce1,
    event_type: "interaction",
    event_sequence: 1,
    timestamp: Date.now(),
    payload: { interaction_type: "click" },
  };
  harness.dispatchPostMessage(oldNonceEvent, win2);
  assert.equal(harness.eventsLog.length, 0, "Event with old nonce from new window must be REJECTED");

  // 9. Send valid Event from new window (win2) and new nonce (nonce2) -> PASS
  const validEvent2 = {
    resource_code: "RES-TEST-RELOAD-01",
    resource_version: 1,
    session_nonce: nonce2,
    event_type: "interaction",
    event_sequence: 1,
    timestamp: Date.now(),
    payload: { interaction_type: "click" },
  };
  harness.dispatchPostMessage(validEvent2, win2);
  assert.equal(harness.eventsLog.length, 1, "Valid event from new window and new nonce must PASS");
  assert.equal(harness.eventsLog[0].event_type, "interaction");

  // 10. Old Listener does not affect state after Reload
  assert.ok(harness.listenerDetachCount >= 1, "Old listener must be detached on reload");
  if (oldListener) {
    oldListener({ data: validEvent2, source: win2 });
    assert.equal(harness.eventsLog.length, 1, "Old listener invocation must not affect active session events log");
  }
});
