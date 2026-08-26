import type { SecurityFinding } from "./types.ts";
import { ValidationCodes } from "./validation-codes.ts";

interface ApiCheckPattern {
  code: (typeof ValidationCodes)[keyof typeof ValidationCodes];
  pattern: RegExp;
  message: string;
}

const FORBIDDEN_API_PATTERNS: ApiCheckPattern[] = [
  {
    code: ValidationCodes.FORBIDDEN_API_EVAL,
    pattern: /\beval\s*\(/i,
    message: "تأطير خطير: تم كشف استخدام الدالة eval().",
  },
  {
    code: ValidationCodes.FORBIDDEN_API_FUNCTION_CTOR,
    pattern: /\bnew\s+Function\s*\(/i,
    message: "تأطير خطير: تم كشف إنشاء دوال حركية عبر new Function().",
  },
  {
    code: ValidationCodes.FORBIDDEN_API_DOCUMENT_WRITE,
    pattern: /\bdocument\.write\b/i,
    message: "ممنوع استخدام document.write داخل حزم المحتوى التفاعلي.",
  },
  {
    code: ValidationCodes.FORBIDDEN_API_WINDOW_PARENT,
    pattern: /\b(window\.)?parent\b/i,
    message: "ممنوع الوصول للنافذة الأب (window.parent) أو شجرة DOM التطبيق الرئيسي.",
  },
  {
    code: ValidationCodes.FORBIDDEN_API_COOKIE,
    pattern: /\bdocument\.cookie\b/i,
    message: "ممنوع قراءة أو كتابة الكوكيز (document.cookie).",
  },
  {
    code: ValidationCodes.FORBIDDEN_API_STORAGE,
    pattern: /\b(localStorage|sessionStorage|indexedDB)\b/i,
    message: "ممنوع الوصول للتخزين المحلي للتطبيق (localStorage / sessionStorage / indexedDB).",
  },
  {
    code: ValidationCodes.FORBIDDEN_API_NETWORK_FETCH,
    pattern: /\b(fetch|XMLHttpRequest|WebSocket|EventSource)\b/i,
    message: "ممنوع استخدام الاتصالات الشبكية المباشرة (fetch / XHR / WebSocket) في MVP.",
  },
  {
    code: ValidationCodes.FORBIDDEN_API_CAPACITOR,
    pattern: /\b(Capacitor|capacitor|CapacitorBridge)\b/i,
    message: "ممنوع الوصول لجسر الهاتف المحمول Native Capacitor bridge.",
  },
  {
    code: ValidationCodes.FORBIDDEN_API_SUPABASE,
    pattern: /\b(supabase|SupabaseClient)\b/i,
    message: "ممنوع استدعاء عميل Supabase أو أسرار التطبيق مباشرة من المحتوى.",
  },
  {
    code: ValidationCodes.SERVICE_WORKER_NOT_ALLOWED,
    pattern: /\bnavigator\.serviceWorker\b/i,
    message: "ممنوع تسجيل ServiceWorker من داخل المحتوى المستورد.",
  },
];

/**
 * Scan JavaScript text or HTML content for forbidden API patterns and remote network URLs.
 */
export function scanCodeSecurity(codeContent: string, filePath: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  // Check remote URLs (http://, https://, //cdn...)
  const remoteUrlRegex = /\b(https?:\/\/|\/\/[a-z0-9.-]+\.[a-z]{2,})/gi;
  let remoteMatch: RegExpExecArray | null;
  while ((remoteMatch = remoteUrlRegex.exec(codeContent)) !== null) {
    const urlSnippet = remoteMatch[0];
    findings.push({
      code: ValidationCodes.REMOTE_NETWORK_URL_DETECTED,
      severity: "error",
      file: filePath,
      snippet: urlSnippet,
      message: `تم كشف رابط شبكي خارجي محظور: ${urlSnippet}. جميع الموارد يجب أن تكون محليّة داخل الحزمة.`,
    });
  }

  // Check forbidden API patterns
  for (const { code, pattern, message } of FORBIDDEN_API_PATTERNS) {
    const match = codeContent.match(pattern);
    if (match) {
      findings.push({
        code,
        severity: "error",
        file: filePath,
        snippet: match[0],
        message,
      });
    }
  }

  return findings;
}
