import type { SecurityFinding } from "./types.ts";
import { ValidationCodes } from "./validation-codes.ts";
import { decodeHtmlEntities, stripControlCharacters } from "./url-normalizer.ts";

interface ForbiddenJsPattern {
  code: (typeof ValidationCodes)[keyof typeof ValidationCodes];
  pattern: RegExp;
  message: string;
}

const FORBIDDEN_JS_PATTERNS: ForbiddenJsPattern[] = [
  {
    code: ValidationCodes.FORBIDDEN_API_EVAL,
    pattern: /\beval\s*\(/i,
    message: "ممنوع استخدام الدالة eval() داخل حزم المحتوى التفاعلي.",
  },
  {
    code: ValidationCodes.FORBIDDEN_API_FUNCTION_CTOR,
    pattern: /\bnew\s+Function\b|\bFunction\s*\(/i,
    message: "ممنوع إنشاء دوال ديناميكية عبر Function constructor.",
  },
  {
    code: ValidationCodes.FORBIDDEN_API_DOCUMENT_WRITE,
    pattern: /\bdocument\s*\.\s*(write|writeln)\b/i,
    message: "ممنوع استخدام document.write أو document.writeln.",
  },
  {
    code: ValidationCodes.FORBIDDEN_API_WINDOW_PARENT,
    pattern:
      /\b(window\s*\.\s*parent|parent\s*\.\s*document|window\s*\.\s*top|top\s*\.\s*location|top\s*\.\s*document)\b/i,
    message: "ممنوع الوصول للنافذة الأب (parent/top) أو شجرة DOM للتطبيق الرئيسي.",
  },
  {
    code: ValidationCodes.FORBIDDEN_API_COOKIE,
    pattern: /\bdocument\s*\.\s*cookie\b/i,
    message: "ممنوع قراءة أو كتابة الكوكيز (document.cookie).",
  },
  {
    code: ValidationCodes.FORBIDDEN_API_STORAGE,
    pattern: /\b(localStorage|sessionStorage|indexedDB)\b/i,
    message: "ممنوع الوصول لوسائط التخزين المحلي (localStorage / sessionStorage / indexedDB).",
  },
  {
    code: ValidationCodes.FORBIDDEN_API_NETWORK_FETCH,
    pattern: /\b(fetch|XMLHttpRequest|WebSocket|EventSource|navigator\s*\.\s*sendBeacon)\b/i,
    message:
      "ممنوع استخدام الاتصالات الشبكية المباشرة (fetch / XHR / WebSocket / EventSource / sendBeacon).",
  },
  {
    code: ValidationCodes.FORBIDDEN_API_CAPACITOR,
    pattern: /\b(Capacitor|capacitor|CapacitorBridge)\b/i,
    message: "ممنوع الوصول لجسر الهاتف المحمول Native Capacitor bridge.",
  },
  {
    code: ValidationCodes.FORBIDDEN_API_SUPABASE,
    pattern: /\b(supabase|SupabaseClient)\b/i,
    message: "ممنوع استدعاء عميل Supabase أو أسرار التطبيق.",
  },
  {
    code: ValidationCodes.SERVICE_WORKER_NOT_ALLOWED,
    pattern: /\b(Worker|SharedWorker|ServiceWorker|navigator\s*\.\s*serviceWorker)\b/i,
    message: "ممنوع استخدام Worker أو SharedWorker أو ServiceWorker.",
  },
  {
    code: ValidationCodes.FORBIDDEN_WEBRTC,
    pattern:
      /\b(RTCPeerConnection|webkitRTCPeerConnection|mozRTCPeerConnection|BroadcastChannel)\b/i,
    message: "ممنوع استخدام قنوات اتصال WebRTC أو BroadcastChannel.",
  },
  {
    code: ValidationCodes.FORBIDDEN_DYNAMIC_IMPORT,
    pattern: /\bimport\s*\(/i,
    message: "ممنوع الاستيراد الديناميكي dynamic import().",
  },
  {
    code: ValidationCodes.FORBIDDEN_WINDOW_OPEN,
    pattern: /\bwindow\s*\.\s*open\s*\(/i,
    message: "ممنوع فتح نوافذ جديدة عبر window.open().",
  },
  {
    code: ValidationCodes.FORBIDDEN_BLOB_SCRIPT_CREATION,
    pattern: /\b(URL\s*\.\s*createObjectURL|new\s+Blob)\b/i,
    message: "ممنوع إنشاء سكربتات حركية من Blob أو data URLs.",
  },
];

/**
 * Scans JavaScript code content for forbidden APIs and constructs.
 */
export function scanJavaScriptContent(jsCode: string, filePath: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  // Normalize string for checks (decode entities & strip control chars)
  const normalizedCode = stripControlCharacters(decodeHtmlEntities(jsCode));

  // Check remote network URLs (http://, https://, //...)
  const remoteUrlRegex = /\b(https?:\/\/|\/\/[a-z0-9.-]+\.[a-z]{2,})/gi;
  let match: RegExpExecArray | null;

  while ((match = remoteUrlRegex.exec(normalizedCode)) !== null) {
    const urlSnippet = match[0];
    findings.push({
      code: ValidationCodes.REMOTE_NETWORK_URL_DETECTED,
      severity: "error",
      file: filePath,
      snippet: urlSnippet,
      message: `تم كشف رابط شبكي خارجي محظور داخل JavaScript: ${urlSnippet}`,
    });
  }

  // Check forbidden JavaScript API patterns
  for (const { code, pattern, message } of FORBIDDEN_JS_PATTERNS) {
    const patMatch = normalizedCode.match(pattern);
    if (patMatch) {
      findings.push({
        code,
        severity: "error",
        file: filePath,
        snippet: patMatch[0],
        message,
      });
    }
  }

  return findings;
}
