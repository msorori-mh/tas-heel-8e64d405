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

function validateStrictPlainObject(val: unknown): { isValid: boolean; reason?: string } {
  if (typeof val !== "object" || val === null || Array.isArray(val)) {
    return { isValid: false, reason: "حمولات الأحداث يجب أن تكون كائناً مجرداً (Plain Object)." };
  }
  const proto = Object.getPrototypeOf(val);
  if (proto !== Object.prototype && proto !== null) {
    return { isValid: false, reason: "كائنات الأحداث يجب أن تكون ذات Prototype مجرد." };
  }
  if (Object.getOwnPropertySymbols(val).length > 0) {
    return { isValid: false, reason: "رموز Symbol غير مسموح بها في كائنات الأحداث." };
  }
  const descriptors = Object.getOwnPropertyDescriptors(val);
  for (const key of Object.keys(descriptors)) {
    const desc = descriptors[key];
    if (desc.get !== undefined || desc.set !== undefined) {
      return {
        isValid: false,
        reason: "المُنشئات والخصائص التلقائية Getters/Setters غير مسموح بها.",
      };
    }
    if (!desc.enumerable) {
      return { isValid: false, reason: "الخصائص غير القابلة للتعداد غير مسموح بها." };
    }
  }
  return { isValid: true };
}

const EXACT_TOP_LEVEL_KEYS = new Set([
  "resource_code",
  "resource_version",
  "session_nonce",
  "event_type",
  "event_sequence",
  "timestamp",
  "payload",
]);

export class AppInteractiveResourceBridge {
  private expectedNonce: string;
  private expectedResourceCode: string;
  private expectedVersion: number;
  private sessionStartTime: number;
  private lastSequence = 0;
  private eventTimestamps: number[] = [];

  constructor(resourceCode: string, version: number, sessionNonce?: string) {
    this.expectedResourceCode = resourceCode;
    this.expectedVersion = version;
    this.expectedNonce = sessionNonce || generateSessionNonce();
    this.sessionStartTime = Date.now();
  }

  public getSessionNonce(): string {
    return this.expectedNonce;
  }

  /**
   * Validate incoming message event payload from sandboxed iframe.
   * Fail-closed: expectedWindow and eventSource are strictly required and must match.
   */
  public validateEventPayload(
    rawPayload: unknown,
    eventSource: WindowProxy | null | undefined,
    expectedWindow: WindowProxy | null | undefined,
  ): {
    isValid: boolean;
    payload?: BridgeEventPayload;
    finding?: SecurityFinding;
  } {
    // 0. Explicit & Mandatory Window source check (Fail-closed)
    if (!expectedWindow || !eventSource || eventSource !== expectedWindow) {
      return {
        isValid: false,
        finding: {
          code: ValidationCodes.INVALID_EVENT_SOURCE,
          severity: "error",
          message:
            "مصدر الحدث (event.source) غير صالح أو لا يطابق إطار المعاينة المحدد (iframeRef.contentWindow).",
        },
      };
    }

    // 1. Top-Level Strict Plain Object Check
    const objCheck = validateStrictPlainObject(rawPayload);
    if (!objCheck.isValid) {
      return {
        isValid: false,
        finding: {
          code: ValidationCodes.INVALID_EVENT_SCHEMA,
          severity: "error",
          message: objCheck.reason || "حمولات الأحداث غير صالحة.",
        },
      };
    }

    const data = rawPayload as Record<string, unknown>;

    // 2. Strict Top-Level Schema Check (Exact Allowlist: exactly 7 allowed keys, no extra, no missing)
    const topKeys = Object.keys(data);
    if (topKeys.length !== EXACT_TOP_LEVEL_KEYS.size) {
      return {
        isValid: false,
        finding: {
          code: ValidationCodes.INVALID_EVENT_SCHEMA,
          severity: "error",
          message: "مخطط الحدث الأعلى يحتوي على حقول زائدة أو ناقصة.",
        },
      };
    }
    for (const key of topKeys) {
      if (!EXACT_TOP_LEVEL_KEYS.has(key)) {
        return {
          isValid: false,
          finding: {
            code: ValidationCodes.INVALID_EVENT_SCHEMA,
            severity: "error",
            message: `حقل غير معرف في أعلى كائن الحدث: ${key}`,
          },
        };
      }
    }

    // 3. Payload size check (10KB UTF-8 byte limit)
    try {
      const payloadString = JSON.stringify(rawPayload);
      const byteSize = new TextEncoder().encode(payloadString).byteLength;
      if (byteSize > PACKAGE_LIMITS.MAX_EVENT_PAYLOAD_BYTES) {
        return {
          isValid: false,
          finding: {
            code: ValidationCodes.PAYLOAD_SIZE_LIMIT_EXCEEDED,
            severity: "error",
            message: `حجم حمولة الحدث (${byteSize} bytes) يتجاوز الحد الأقصى المسموح به (${PACKAGE_LIMITS.MAX_EVENT_PAYLOAD_BYTES} bytes).`,
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

    const nonce = typeof data.session_nonce === "string" ? data.session_nonce : "";
    const resourceCode = typeof data.resource_code === "string" ? data.resource_code : "";
    const version = typeof data.resource_version === "number" ? data.resource_version : 0;
    const eventType = typeof data.event_type === "string" ? data.event_type : "";

    // 4. Session Nonce check
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

    // 5. Resource Code & Version check
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

    // 6. Allowed Event Type check
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

    // 7. Timestamp check (finite number, not before session start - 5s, not in future > 60s)
    if (typeof data.timestamp !== "number" || !Number.isFinite(data.timestamp)) {
      return {
        isValid: false,
        finding: {
          code: ValidationCodes.INVALID_EVENT_SCHEMA,
          severity: "error",
          message: "طابع الوقت (timestamp) غير صالح أو غير معرف كعدد محدود.",
        },
      };
    }
    const timestamp = data.timestamp;
    if (timestamp < this.sessionStartTime - 5000) {
      return {
        isValid: false,
        finding: {
          code: ValidationCodes.INVALID_EVENT_SCHEMA,
          severity: "error",
          message: "طابع الوقت أقدم من بداية الجلسة الحالية (Stale event timestamp).",
        },
      };
    }
    if (timestamp > Date.now() + 60000) {
      return {
        isValid: false,
        finding: {
          code: ValidationCodes.INVALID_EVENT_SCHEMA,
          severity: "error",
          message: "طابع الوقت بعيد في المستقبل (Future timestamp rejected).",
        },
      };
    }

    // 8. Sequence monotonic check (positive integer & strict > lastSequence)
    if (
      typeof data.event_sequence !== "number" ||
      !Number.isInteger(data.event_sequence) ||
      data.event_sequence <= 0
    ) {
      return {
        isValid: false,
        finding: {
          code: ValidationCodes.INVALID_EVENT_SCHEMA,
          severity: "error",
          message: "رقم تسلسل الحدث يجب أن يكون عدداً صحيحاً موجباً.",
        },
      };
    }
    const sequence = data.event_sequence;
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

    // 9. Strict Inner Payload Schema per event_type
    const innerPayload = data.payload;
    const innerCheck = validateStrictPlainObject(innerPayload);
    if (!innerCheck.isValid) {
      return {
        isValid: false,
        finding: {
          code: ValidationCodes.INVALID_EVENT_SCHEMA,
          severity: "error",
          message: innerCheck.reason || "البيانات الإضافية (payload) غير صالحة.",
        },
      };
    }

    const payloadObj = innerPayload as Record<string, unknown>;
    const payloadKeys = Object.keys(payloadObj);

    if (eventType === "resource_ready" || eventType === "resource_started") {
      if (payloadKeys.length > 0) {
        return {
          isValid: false,
          finding: {
            code: ValidationCodes.INVALID_EVENT_SCHEMA,
            severity: "error",
            message: `حدث ${eventType} لا يقبل حقولاً إضافية في payload.`,
          },
        };
      }
    } else if (eventType === "interaction") {
      const allowedKeys = new Set(["interaction_type", "target", "action"]);
      for (const k of payloadKeys) {
        if (!allowedKeys.has(k)) {
          return {
            isValid: false,
            finding: {
              code: ValidationCodes.INVALID_EVENT_SCHEMA,
              severity: "error",
              message: `حقل غير معروف في payload حدث interaction: ${k}`,
            },
          };
        }
      }
      if (
        typeof payloadObj.interaction_type !== "string" ||
        payloadObj.interaction_type.trim().length === 0 ||
        payloadObj.interaction_type.length > 100
      ) {
        return {
          isValid: false,
          finding: {
            code: ValidationCodes.INVALID_EVENT_SCHEMA,
            severity: "error",
            message:
              "حدث interaction يتطلب interaction_type كسلسلة نصية غير فارغة ومحدودة الطول (حتى 100 حرف).",
          },
        };
      }
      if (
        payloadObj.target !== undefined &&
        (typeof payloadObj.target !== "string" || payloadObj.target.length > 100)
      ) {
        return {
          isValid: false,
          finding: {
            code: ValidationCodes.INVALID_EVENT_SCHEMA,
            severity: "error",
            message: "خاصية target في interaction يجب أن تكون نصية ومحدودة.",
          },
        };
      }
      if (
        payloadObj.action !== undefined &&
        (typeof payloadObj.action !== "string" || payloadObj.action.length > 100)
      ) {
        return {
          isValid: false,
          finding: {
            code: ValidationCodes.INVALID_EVENT_SCHEMA,
            severity: "error",
            message: "خاصية action في interaction يجب أن تكون نصية ومحدودة.",
          },
        };
      }
    } else if (eventType === "step_completed") {
      const allowedKeys = new Set(["step"]);
      for (const k of payloadKeys) {
        if (!allowedKeys.has(k)) {
          return {
            isValid: false,
            finding: {
              code: ValidationCodes.INVALID_EVENT_SCHEMA,
              severity: "error",
              message: `حقل غير معروف في payload حدث step_completed: ${k}`,
            },
          };
        }
      }
      const stepVal = payloadObj.step;
      if (typeof stepVal !== "string" || stepVal.trim().length === 0 || stepVal.length > 100) {
        return {
          isValid: false,
          finding: {
            code: ValidationCodes.INVALID_EVENT_SCHEMA,
            severity: "error",
            message: "حدث step_completed يتطلب خاصية step كسلسلة نصية غير فارغة ومحدودة الطول.",
          },
        };
      }
    } else if (eventType === "experiment_completed") {
      const allowedKeys = new Set(["summary", "completed_at", "duration_seconds"]);
      for (const k of payloadKeys) {
        if (!allowedKeys.has(k)) {
          return {
            isValid: false,
            finding: {
              code: ValidationCodes.INVALID_EVENT_SCHEMA,
              severity: "error",
              message: `حقل غير مقبول في payload حدث experiment_completed: ${k}`,
            },
          };
        }
      }
      if (
        payloadObj.summary !== undefined &&
        (typeof payloadObj.summary !== "string" || payloadObj.summary.length > 200)
      ) {
        return {
          isValid: false,
          finding: {
            code: ValidationCodes.INVALID_EVENT_SCHEMA,
            severity: "error",
            message:
              "خاصية summary في experiment_completed يجب أن تكون نصية ومحدودة (حتى 200 حرف).",
          },
        };
      }
      if (
        payloadObj.completed_at !== undefined &&
        (typeof payloadObj.completed_at !== "number" || !Number.isFinite(payloadObj.completed_at))
      ) {
        return {
          isValid: false,
          finding: {
            code: ValidationCodes.INVALID_EVENT_SCHEMA,
            severity: "error",
            message: "خاصية completed_at في experiment_completed يجب أن تكون رقماً محدوداً.",
          },
        };
      }
      if (
        payloadObj.duration_seconds !== undefined &&
        (typeof payloadObj.duration_seconds !== "number" ||
          !Number.isFinite(payloadObj.duration_seconds) ||
          payloadObj.duration_seconds < 0)
      ) {
        return {
          isValid: false,
          finding: {
            code: ValidationCodes.INVALID_EVENT_SCHEMA,
            severity: "error",
            message:
              "خاصية duration_seconds في experiment_completed يجب أن تكون رقماً موجب المحتوى.",
          },
        };
      }
    } else if (eventType === "resource_error") {
      const allowedKeys = new Set(["error_code", "message"]);
      for (const k of payloadKeys) {
        if (!allowedKeys.has(k)) {
          return {
            isValid: false,
            finding: {
              code: ValidationCodes.INVALID_EVENT_SCHEMA,
              severity: "error",
              message: `حقل غير معروف في payload حدث resource_error: ${k}`,
            },
          };
        }
      }
      const errCode = payloadObj.error_code;
      if (typeof errCode !== "string" || errCode.trim().length === 0 || errCode.length > 50) {
        return {
          isValid: false,
          finding: {
            code: ValidationCodes.INVALID_EVENT_SCHEMA,
            severity: "error",
            message:
              "حدث resource_error يتطلب error_code كسلسلة نصية غير فارغة ومحدودة الطول (حتى 50 حرف).",
          },
        };
      }
      const msg = payloadObj.message;
      if (msg !== undefined) {
        if (typeof msg !== "string" || msg.length > 200) {
          return {
            isValid: false,
            finding: {
              code: ValidationCodes.INVALID_EVENT_SCHEMA,
              severity: "error",
              message: "رسالة الخطأ message يجب أن تكون نصية وأقل من 200 حرف.",
            },
          };
        }
        if (/<[^>]*>/.test(msg) || /at\s+[\w$.]+\s+\(/.test(msg) || /\n\s*at\s+/.test(msg)) {
          return {
            isValid: false,
            finding: {
              code: ValidationCodes.INVALID_EVENT_SCHEMA,
              severity: "error",
              message: "رسالة الخطأ لا يمكن أن تحتوي على HTML أو تتبع كدسة Stack trace.",
            },
          };
        }
      }
    } else if (eventType === "resize_request") {
      const allowedKeys = new Set(["height"]);
      for (const k of payloadKeys) {
        if (!allowedKeys.has(k)) {
          return {
            isValid: false,
            finding: {
              code: ValidationCodes.INVALID_EVENT_SCHEMA,
              severity: "error",
              message: `حقل غير معروف في payload حدث resize_request: ${k}`,
            },
          };
        }
      }
      const heightVal = payloadObj.height;
      if (
        typeof heightVal !== "number" ||
        !Number.isFinite(heightVal) ||
        heightVal <= 0 ||
        heightVal > 5000
      ) {
        return {
          isValid: false,
          finding: {
            code: ValidationCodes.INVALID_EVENT_SCHEMA,
            severity: "error",
            message: "حدث resize_request يتطلب خاصية height كعدد موجَب محدود (ضمن 1-5000 px).",
          },
        };
      }
    }

    // 10. Rate limiting check (max 20 events per second)
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
      timestamp: timestamp,
      payload: payloadObj,
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
    nonce: string,
  ): string {
    return `(function(){var nonce=${JSON.stringify(nonce)};var resourceCode=${JSON.stringify(resourceCode)};var version=${JSON.stringify(version)};var sequence=0;window.__TasheelBridge={sendEvent:function(eventType,payload){sequence++;var message={resource_code:resourceCode,resource_version:version,session_nonce:nonce,event_type:eventType,event_sequence:sequence,timestamp:Date.now(),payload:payload||{}};window.parent.postMessage(message,"*");},markReady:function(){this.sendEvent("resource_ready",{});},markStarted:function(){this.sendEvent("resource_started",{});},sendInteraction:function(data){this.sendEvent("interaction",data);},markStepCompleted:function(stepIndex){this.sendEvent("step_completed",{step:String(stepIndex)});},markExperimentCompleted:function(summary){this.sendEvent("experiment_completed",summary||{});},requestResize:function(height){this.sendEvent("resize_request",{height:height});}};})();`;
  }
}
