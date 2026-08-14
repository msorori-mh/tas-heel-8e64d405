/**
 * LESSON_EXTERNAL_PDF_DELIVERY_13F — student launcher for lessons whose content
 * lives in an external file (typically a Google Drive PDF).
 */

import { ExternalLink, FileText, PlayCircle, Link2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  classifyExternalResource,
  externalResourceCta,
  toDrivePreviewUrl,
  toExternalOpenUrl,
} from "@/lib/lessons/lesson-delivery";

export type PrimaryLessonResource = {
  id: string;
  resource_type: string | null;
  title: string | null;
  url: string;
  description?: string | null;
};

export function ExternalLessonDelivery({ resource }: { resource: PrimaryLessonResource }) {
  const openUrl = toExternalOpenUrl(resource.url);
  const kind = classifyExternalResource(resource.resource_type, resource.url);
  const previewUrl = kind === "drive_pdf" ? toDrivePreviewUrl(resource.url) : null;

  const Icon = kind === "video" ? PlayCircle : kind === "link" ? Link2 : FileText;

  if (!openUrl) {
    return (
      <section className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-card">
        رابط ملف الدرس غير صالح. يرجى إبلاغ إدارة المحتوى.
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-card" dir="rtl">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-xl bg-primary/10 p-2 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-foreground">
            {resource.title?.trim() || "ملف الدرس"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {resource.description?.trim() ||
              "محتوى هذا الدرس متوفر كملف خارجي — افتحه لمتابعة الشرح كاملاً."}
          </p>
        </div>
      </div>

      {previewUrl && (
        <div className="overflow-hidden rounded-xl border border-border">
          <iframe
            src={previewUrl}
            title={resource.title?.trim() || "ملف الدرس"}
            loading="lazy"
            className="h-[60vh] w-full min-h-80 bg-muted"
            allow="autoplay"
            referrerPolicy="no-referrer"
          />
        </div>
      )}

      <Button asChild className="w-full">
        <a href={openUrl} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="ms-2 h-4 w-4" />
          {externalResourceCta(kind)}
        </a>
      </Button>
    </section>
  );
}
