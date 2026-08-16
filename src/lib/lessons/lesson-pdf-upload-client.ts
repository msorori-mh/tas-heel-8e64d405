/** 18D — browser-side upload helper: signed target -> bytes -> lesson binding. */

import { supabase } from "@/integrations/supabase/client";

export const MAX_LESSON_PDF_BYTES = 100 * 1024 * 1024;

export type UploadFns = {
  createTarget: (args: {
    data: { lessonId: string; fileName: string; fileSize: number };
  }) => Promise<{ bucket: string; path: string; token: string }>;
  bind: (args: {
    data: {
      lessonId: string;
      path: string;
      fileName: string;
      fileSize: number;
      title?: string | null;
    };
  }) => Promise<{ resourceId: string; replaced: boolean; version: string }>;
};

export function validatePdfFile(file: File): string | null {
  if (!/\.pdf$/i.test(file.name)) return "الامتداد يجب أن يكون .pdf";
  if (file.type && file.type !== "application/pdf") return "نوع الملف يجب أن يكون application/pdf";
  if (file.size <= 0) return "الملف فارغ (0 بايت)";
  if (file.size > MAX_LESSON_PDF_BYTES) return "الحجم يتجاوز 100 ميغابايت";
  return null;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "—";
  const units = ["بايت", "ك.ب", "م.ب", "غ.ب"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export async function uploadLessonPrimaryPdf(
  fns: UploadFns,
  lessonId: string,
  file: File,
  title?: string | null,
) {
  const invalid = validatePdfFile(file);
  if (invalid) throw new Error(invalid);

  const target = await fns.createTarget({
    data: { lessonId, fileName: file.name, fileSize: file.size },
  });

  const { error } = await supabase.storage
    .from(target.bucket)
    .uploadToSignedUrl(target.path, target.token, file, {
      contentType: "application/pdf",
      upsert: false,
    });
  if (error) throw new Error(`فشل رفع الملف: ${error.message}`);

  return fns.bind({
    data: {
      lessonId,
      path: target.path,
      fileName: file.name,
      fileSize: file.size,
      title: title ?? null,
    },
  });
}
