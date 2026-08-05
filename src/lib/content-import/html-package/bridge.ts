import { ALLOWED_BRIDGE_EVENT_TYPES, PACKAGE_LIMITS } from "./types.ts";
import type { BridgeEventPayload, BridgeEventType, SecurityFinding } from "./types.ts";
import { ValidationCodes } from "./validation-codes.ts";

/**
 * Generate a cryptographically secure random session nonce for communication isolation.
 * Throws error (fail-closed) if secure crypto API is missing.
 */
export function generateSessionNonce(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const array = new Uint8Array(16);
    globalThis.crypto.getRandomValues(array);
    return Array.from(array)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  // Fail-closed: Never use Math.random fallback for security nonces
  throw new Error("FAIL_CLOSED: Secure crypto getRandomValues is unavailable.");
}

export class AppInteractiveResourceBridge {
  private expectedNonce: string;
  private expectedResourceCode: string;
  private expectedVersion: number;
  private lastSequence = 0;
  private eventTimestamps: number[] = [];

  constructor(resourceCode: string, version: number, sessionNonce?: string) {
    this.expectedResourceCode = resourceCode;
    this.expectedVersion = version;
    this.expectedNonce = sessionNonce || generateSessionNonce();
  }

  public getSessionNonce(): string {
    return this.expectedNonce;
  }

  /**
   * Validate incoming message event payload from sandboxed iframe.
   */
  public validateEventPayload(
    rawPayload: unknown,
    eventSource?: WindowProxy | null,
    expectedWindow?: WindowProxy | null
  ): {
    isValid: boolean;
    payload?: BridgeEventPayload;
    finding?: SecurityFinding;
  } {
    // 0. Explicit Window source check
    if (expectedWindow && eventSource !== expectedWindow) {
      return {
        isValid: false,
        finding: {
          code: ValidationCodes.INVALID_EVENT_SOURCE,
          severity: "error",
          message: "مصدر الحدث (event.source) لا يطابق إطار المعاينة المحدد (iframeRef.contentWindow).",
        },
      };
    }

    if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
      return {
        isValid: false,
        finding: {
          code: ValidationCodes.INVALID_EVENT_SCHEMA,
          severity: "error",
          message: "حمولات الأحداث يجب أن تكون كائناً مجرداً.",
        },
      };
    }

    // Payload size check (10KB limit)
    try {
      const payloadString = JSON.stringify(rawPayload);
      if (payloadString.length > PACKAGE_LIMITS.MAX_EVENT_PAYLOAD_BYTES) {
        return {
          isValid: false,
          finding: {
            code: ValidationCodes.PAYLOAD_SIZE_LIMIT_EXCEEDED,
            severity: "error",
            message: `حجم حمولة الحدث (${payloadString.length} bytes) يتجاوز الحد الأقصى المسموح به (${PACKAGE_LIMITS.MAX_EVENT_PAYLOAD_BYTES} bytes).`,
          },
        };
      }
    } catch {
      return {
        isValid: false,
        finding: {
          code: ValidationCodes.INVALID_EVENT_SCHEMA,
          severity: "error",
          message: "حمولات الأحداث غير قابلة للترميز.",
        },
      };
    }

    const data = rawPayload as Record<string, unknown>;

    const nonce = typeof data.session_nonce === "string" ? data.session_nonce : "";
    const resourceCode = typeof data.resource_code === "string" ? data.resource_code : "";
    const version = typeof data.resource_version === "number" ? data.resource_version : 0;
    const eventType = typeof data.event_type === "string" ? data.event_type : "";
    const sequence = typeof data.event_sequence === "number" ? data.event_sequence : 0;
    const timestamp = typeof data.timestamp === "number" ? data.timestamp : 0;

    // 1. Session Nonce check
    if (!nonce || nonce !== this.expectedNonce) {
      return {
        isValid: false,
        finding: {
          code: ValidationCodes.NONCE_MISMATCH,
          severity: "error",
          message: "رمز الجلسة Session Nonce غير مطابق أو منتهي الصلاحية.",
        },
      };
    }

    // 2. Resource Code & Version check
    if (resourceCode !== this.expectedResourceCode || version !== this.expectedVersion) {
      return {
        isValid: false,
        finding: {
          code: ValidationCodes.RESOURCE_CODE_MISMATCH,
          severity: "error",
          message: `كود المورد (${resourceCode}) أو إصداره (${version}) لا يطابق التوقع (${this.expectedResourceCode} v${this.expectedVersion}).`,
        },
      };
    }

    // 3. Allowed Event Type check
    if (!ALLOWED_BRIDGE_EVENT_TYPES.includes(eventType as BridgeEventType)) {
      return {
        isValid: false,
        finding: {
          code: ValidationCodes.INVALID_EVENT_SCHEMA,
          severity: "error",
          message: `نوع الحدث غير مسجل في عقد التواصل: ${eventType}`,
        },
      };
    }

    // 4. Sequence monotonic check (strict > lastSequence)
    if (sequence <= this.lastSequence) {
      return {
        isValid: false,
        finding: {
          code: ValidationCodes.INVALID_EVENT_SCHEMA,
          severity: "error",
          message: `تسلسل الأحداث غير تصاعدي أو مكرر: ${sequence} (السابق ${this.lastSequence}).`,
        },
      };
    }

    // 5. Rate limiting check (max 20 events per second)
    const now = Date.now();
    this.eventTimestamps = this.eventTimestamps.filter((ts) => now - ts < 1000);
    if (this.eventTimestamps.length >= PACKAGE_LIMITS.MAX_EVENT_RATE_PER_SECOND) {
      return {
        isValid: false,
        finding: {
          code: ValidationCodes.EVENT_RATE_LIMIT_EXCEEDED,
          severity: "error",
          message: "تم تجاوز حد معدل إرسال الأحداث المسموح به (20 حدث/ثانية).",
        },
      };
    }

    this.lastSequence = sequence;
    this.eventTimestamps.push(now);

    const validPayload: BridgeEventPayload = {
      resource_code: resourceCode,
      resource_version: version,
      session_nonce: nonce,
      event_type: eventType as BridgeEventType,
      event_sequence: sequence,
      timestamp: timestamp || now,
      payload: (data.payload as Record<string, unknown>) || undefined,
    };

    return {
      isValid: true,
      payload: validPayload,
    };
  }

  /**
   * Helper code snippet injected into sandboxed runtime to communicate with host via postMessage.
   */
  public static getClientRuntimeBridgeScript(
    resourceCode: string,
    version: number,
    nonce: string
  ): string {
    return `
      (function() {
        var nonce = ${JSON.stringify(nonce)};
        var resourceCode = ${JSON.stringify(resourceCode)};
        var version = ${JSON.stringify(version)};
        var sequence = 0;

        window.__TasheelBridge = {
          sendEvent: function(eventType, payload) {
            sequence++;
            var message = {
              resource_code: resourceCode,
              resource_version: version,
              session_nonce: nonce,
              event_type: eventType,
              event_sequence: sequence,
              timestamp: Date.now(),
              payload: payload || {}
            };
            window.parent.postMessage(message, "*");
          },
          markReady: function() { this.sendEvent("resource_ready"); },
          markStarted: function() { this.sendEvent("resource_started"); },
          sendInteraction: function(data) { this.sendEvent("interaction", data); },
          markStepCompleted: function(stepIndex) { this.sendEvent("step_completed", { step: stepIndex }); },
          markExperimentCompleted: function(summary) { this.sendEvent("experiment_completed", summary); },
          requestResize: function(height) { this.sendEvent("resize_request", { height: height }); }
        };
      })();
    `;
  }
}
