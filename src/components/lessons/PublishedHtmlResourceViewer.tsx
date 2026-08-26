import React, { useState, useEffect, useCallback, useRef } from "react";
import JSZip from "jszip";
import { AlertTriangle, Lock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InteractiveResourceViewer, InteractiveResourceItem } from "./InteractiveResourceViewer";
import { evaluateRuntimeCapability } from "@/lib/content-import/html-package/capacitor-gate";
import type { BridgeEventPayload } from "@/lib/content-import/html-package/types";
import type { LessonHtmlResourceItem } from "@/lib/api/html-pipeline.functions";

interface Props {
  resource: LessonHtmlResourceItem;
  onEventTriggered?: (payload: BridgeEventPayload) => void;
  onReloadSignedUrl: () => Promise<string | null>;
}

type ViewerState = "loading" | "ready" | "error" | "unavailable";

/**
 * Fetches published HTML content via signed URL, extracts the ZIP package,
 * and renders through InteractiveResourceViewer with full security isolation.
 *
 * Handles: signed URL expiry/refresh, Capacitor fail-closed, error states.
 * No direct Storage path or raw URL fallback.
 */
export function PublishedHtmlResourceViewer({
  resource,
  onEventTriggered,
  onReloadSignedUrl,
}: Props) {
  const [state, setState] = useState<ViewerState>("loading");
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capability] = useState(() => evaluateRuntimeCapability());
  const [currentSignedUrl, setCurrentSignedUrl] = useState(resource.signedUrl);

  const generationRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);
  const resourceIdRef = useRef(resource.resourceId);

  const cancelInflight = useCallback(() => {
    generationRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, []);

  const fetchAndExtract = useCallback(
    async (signedUrl: string) => {
      cancelInflight();
      const generation = generationRef.current;
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setState("loading");
      setError(null);
      setHtmlContent(null);

      try {
        const response = await fetch(signedUrl, {
          signal: controller.signal,
        });
        if (generation !== generationRef.current) return;
        if (!response.ok) {
          throw new Error(`فشل تحميل المورد (HTTP ${response.status})`);
        }

        const buffer = await response.arrayBuffer();
        if (generation !== generationRef.current) return;
        const zip = await JSZip.loadAsync(buffer);
        if (generation !== generationRef.current) return;

        let entryFileName = "index.html";
        const manifestFile = zip.file("package/manifest.json") || zip.file("manifest.json");
        if (manifestFile) {
          try {
            const manifestText = await manifestFile.async("text");
            const manifest = JSON.parse(manifestText);
            if (manifest.entry_file) {
              entryFileName = manifest.entry_file;
            }
          } catch {
            // Fall back to default entry file
          }
        }
        if (generation !== generationRef.current) return;

        const entryFile = zip.file(`package/${entryFileName}`) || zip.file(entryFileName);
        if (!entryFile) {
          const htmlFiles = zip.file(/package\/.*\.html$/);
          if (htmlFiles.length > 0) {
            const html = await htmlFiles[0].async("text");
            if (generation !== generationRef.current) return;
            setHtmlContent(html);
            setState("ready");
            return;
          }
          throw new Error("ملف الدخول غير موجود في الحزمة");
        }

        const html = await entryFile.async("text");
        if (generation !== generationRef.current) return;
        setHtmlContent(html);
        setState("ready");
      } catch (err: unknown) {
        if (generation !== generationRef.current) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        const msg = err instanceof Error ? err.message : "حدث خطأ غير متوقع";
        setError(msg);
        setState("error");
      }
    },
    [cancelInflight],
  );

  useEffect(() => {
    if (!capability.allowed) {
      setState("unavailable");
      return;
    }
    fetchAndExtract(currentSignedUrl);
  }, [currentSignedUrl, capability.allowed, fetchAndExtract]);

  // Sync signed URL when the resource identity changes (new resource prop).
  // The fetch effect handles cancellation via fetchAndExtract's cancelInflight call.
  useEffect(() => {
    setCurrentSignedUrl((prev) => (prev !== resource.signedUrl ? resource.signedUrl : prev));
  }, [resource.resourceId, resource.signedUrl]);

  // Track mount lifecycle and resource identity for async guards
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      cancelInflight();
      mountedRef.current = false;
    };
  }, [cancelInflight]);

  useEffect(() => {
    resourceIdRef.current = resource.resourceId;
  }, [resource.resourceId]);

  const handleReload = async () => {
    if (state === "loading") return;
    cancelInflight();
    const signerGeneration = generationRef.current;
    const signerResourceId = resourceIdRef.current;
    setState("loading");
    setError(null);
    setHtmlContent(null);
    try {
      const newUrl = await onReloadSignedUrl();
      if (!mountedRef.current) return;
      if (generationRef.current !== signerGeneration) return;
      if (resourceIdRef.current !== signerResourceId) return;
      if (newUrl) {
        setCurrentSignedUrl(newUrl);
      } else {
        setError("تعذّر تجديد رابط الوصول الآمن");
        setState("error");
      }
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      if (generationRef.current !== signerGeneration) return;
      if (resourceIdRef.current !== signerResourceId) return;
      const msg = err instanceof Error ? err.message : "تعذّر تجديد رابط الوصول الآمن";
      setError(msg);
      setState("error");
    }
  };

  // Capacitor / unsupported environment — fail-closed
  if (!capability.allowed) {
    return (
      <div
        className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-900/50 dark:bg-amber-950/30"
        dir="rtl"
      >
        <Lock className="mx-auto h-10 w-10 text-amber-500" />
        <p className="mt-2 font-semibold text-sm text-foreground">
          {capability.userMessage || "المحتوى التفاعلي متاح حالياً في نسخة الويب فقط."}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          تم إيقاف تشغيل المحتوى التفاعلي احترازياً في البيئات غير المتوافقة لحماية الجلسة
          والبيانات.
        </p>
      </div>
    );
  }

  if (state === "loading") {
    return (
      <div
        className="flex items-center justify-center gap-2 rounded-xl border border-border bg-muted/20 p-8"
        dir="rtl"
      >
        <RefreshCw className="h-6 w-6 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">جارٍ تحميل المورد التفاعلي…</span>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div
        className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center"
        dir="rtl"
      >
        <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
        <p className="mt-2 font-semibold text-sm text-destructive">
          {error || "تعذّر تحميل المورد التفاعلي"}
        </p>
        <Button size="sm" variant="outline" className="mt-3" onClick={handleReload}>
          <RefreshCw className="ml-2 h-4 w-4" />
          إعادة المحاولة
        </Button>
      </div>
    );
  }

  if (state === "unavailable") {
    return (
      <div className="rounded-xl border border-border bg-muted/20 p-6 text-center" dir="rtl">
        <p className="text-sm text-muted-foreground">هذا المورد غير متاح حالياً.</p>
      </div>
    );
  }

  if (!htmlContent) {
    return null;
  }

  const viewerItem: InteractiveResourceItem = {
    id: resource.resourceId,
    resource_code: resource.resourceCode,
    resource_type: resource.resourceType,
    title_ar: resource.title,
    version: resource.version,
    entry_file: "index.html",
    html_content: htmlContent,
    offline_enabled: false,
  };

  return <InteractiveResourceViewer resource={viewerItem} onEventTriggered={onEventTriggered} />;
}
