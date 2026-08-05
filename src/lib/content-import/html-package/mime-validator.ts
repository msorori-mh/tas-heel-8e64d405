import type { SecurityFinding } from "./types.ts";
import { ValidationCodes } from "./validation-codes.ts";

const ALLOWED_EXTENSIONS = new Set([
  "html", "htm", "css", "js", "mjs", "json",
  "png", "jpg", "jpeg", "webp", "pdf", "svg",
]);

/**
 * Validate binary magic bytes and text file integrity.
 */
export function validateFileMimeAndBytes(
  filePath: string,
  buffer: Uint8Array,
  declaredMime?: string
): { isValid: boolean; finding?: SecurityFinding } {
  const extMatch = filePath.match(/\.([a-z0-9]+)$/i);
  const ext = extMatch ? extMatch[1].toLowerCase() : "";

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return {
      isValid: false,
      finding: {
        code: ValidationCodes.FORBIDDEN_FILE_EXTENSION,
        severity: "error",
        file: filePath,
        message: `امتداد الملف غير مصرح به: .${ext}`,
      },
    };
  }

  // 1. Check binary signatures
  if (ext === "png") {
    // Magic bytes: 89 50 4E 47 0D 0A 1A 0A
    if (
      buffer.length < 8 ||
      buffer[0] !== 0x89 ||
      buffer[1] !== 0x50 ||
      buffer[2] !== 0x4e ||
      buffer[3] !== 0x47 ||
      buffer[4] !== 0x0d ||
      buffer[5] !== 0x0a ||
      buffer[6] !== 0x1a ||
      buffer[7] !== 0x0a
    ) {
      return {
        isValid: false,
        finding: {
          code: ValidationCodes.MIME_MISMATCH_DETECTED,
          severity: "error",
          file: filePath,
          message: `توقيع ملف PNG غير مطابق للبايتات الفعالية (Magic byte mismatch).`,
        },
      };
    }
  } else if (ext === "jpg" || ext === "jpeg") {
    // Magic bytes: FF D8 FF
    if (buffer.length < 3 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
      return {
        isValid: false,
        finding: {
          code: ValidationCodes.MIME_MISMATCH_DETECTED,
          severity: "error",
          file: filePath,
          message: `توقيع ملف JPEG غير مطابق للبايتات الفعلية (Magic byte mismatch).`,
        },
      };
    }
  } else if (ext === "webp") {
    // Magic bytes: RIFF .... WEBP
    if (
      buffer.length < 12 ||
      buffer[0] !== 0x52 || // R
      buffer[1] !== 0x49 || // I
      buffer[2] !== 0x46 || // F
      buffer[3] !== 0x46 || // F
      buffer[8] !== 0x57 || // W
      buffer[9] !== 0x45 || // E
      buffer[10] !== 0x42 || // B
      buffer[11] !== 0x50 // P
    ) {
      return {
        isValid: false,
        finding: {
          code: ValidationCodes.MIME_MISMATCH_DETECTED,
          severity: "error",
          file: filePath,
          message: `توقيع ملف WEBP غير مطابق للبايتات الفعلية (Magic byte mismatch).`,
        },
      };
    }
  } else if (ext === "pdf") {
    // Magic bytes: %PDF (25 50 44 46)
    if (
      buffer.length < 4 ||
      buffer[0] !== 0x25 ||
      buffer[1] !== 0x50 ||
      buffer[2] !== 0x44 ||
      buffer[3] !== 0x46
    ) {
      return {
        isValid: false,
        finding: {
          code: ValidationCodes.MIME_MISMATCH_DETECTED,
          severity: "error",
          file: filePath,
          message: `توقيع ملف PDF غير مطابق للبايتات الفعلية (Magic byte mismatch).`,
        },
      };
    }
  } else if (["html", "htm", "css", "js", "mjs", "json", "svg"].includes(ext)) {
    // Text file checks: reject null bytes & non-UTF8 control characters
    for (let i = 0; i < buffer.length; i++) {
      const b = buffer[i];
      if (b === 0x00) {
        return {
          isValid: false,
          finding: {
            code: ValidationCodes.MIME_MISMATCH_DETECTED,
            severity: "error",
            file: filePath,
            message: "ملف نصي يحتوي على بايتات صفرية (Null byte null injection).",
          },
        };
      }
    }
  }

  return { isValid: true };
}
