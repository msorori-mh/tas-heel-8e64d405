import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Maximize2, Minimize2, RefreshCw, RotateCcw, ShieldCheck, Sparkles, Play, CheckCircle2, AlertTriangle, DownloadCloud, Lock } from "lucide-react";
import {
  AppInteractiveResourceBridge,
  buildPackageCsp,
  generatePreviewHtmlBundle,
  generateSessionNonce,
  BridgeEventPayload,
  evaluateRuntimeCapability,
} from "@/lib/content-import/html-package/index";

export interface InteractiveResourceItem {
  id: string;
  resource_code: string;
  resource_type: "mind_map_html" | "practical_experiment_html";
  title_ar: string;
  description_ar?: string | null;
  alt_text_ar?: string | null;
  version: number;
  entry_file: string;
  html_content: string;
  offline_enabled: boolean;
  orientation?: "auto" | "portrait" | "landscape";
  height_mode?: "fixed" | "viewport" | "content";
  completion_mode?: "view" | "interaction_event" | "manual_review";
  completion_event?: "experiment_started" | "step_completed" | "experiment_completed" | null;
}

interface Props {
  resource: InteractiveResourceItem;
  onEventTriggered?: (payload: BridgeEventPayload) => void;
}

export function InteractiveResourceViewer({ resource, onEventTriggered }: Props) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [capability] = useState(() => evaluateRuntimeCapability());
  const [nonce] = useState(() => {
    try {
      return generateSessionNonce();
    } catch {
      return "";
    }
  });
  const [bridge] = useState(() => (nonce ? new AppInteractiveResourceBridge(resource.resource_code, resource.version, nonce) : null));
  const [eventsLog, setEventsLog] = useState<BridgeEventPayload[]>([]);
  const [resourceReportedCompleted, setResourceReportedCompleted] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Generate safe srcDoc bundle with CSP meta and client bridge script
  const [srcDoc, setSrcDoc] = useState("");

  useEffect(() => {
    if (!capability.allowed) {
      setErrorMsg(capability.userMessage || "المحتوى التفاعلي غير مدعوم في هذه البيئة.");
      setLoading(false);
      return;
    }

    if (!nonce || !bridge) {
      setErrorMsg("فشل تهيئة التشفير الآمن (Cryptographic Nonce missing). البيئة غير آمنة.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setErrorMsg(null);

      // Asynchronously build CSP with exact SHA-256 Base64 bridge script hash
      buildPackageCsp([], resource.resource_code, resource.version, nonce).then((csp) => {
        const bundle = generatePreviewHtmlBundle(
          resource.html_content,
          [],
          csp,
          resource.resource_code,
          resource.version,
          nonce
        );
        setSrcDoc(bundle);
        setLoading(false);
      }).catch((err: any) => {
        setErrorMsg(err.message || "حدث خطأ أثناء بناء سياسة الأمان CSP.");
        setLoading(false);
      });
    } catch (err: any) {
      setErrorMsg(err.message || "حدث خطأ أثناء إعداد المورد التفاعلي.");
      setLoading(false);
    }
  }, [resource, nonce, bridge, capability]);

  // Listen for window postMessage events from sandboxed iframe
  useEffect(() => {
    if (!bridge || !capability.allowed) return;

    const handleMessage = (event: MessageEvent) => {
      // Validate session nonce, origin, and exact iframeRef window
      const validation = bridge.validateEventPayload(
        event.data,
        event.source as WindowProxy | null,
        iframeRef.current?.contentWindow
      );

      if (validation.isValid && validation.payload) {
        const payload = validation.payload;
        setEventsLog((prev) => [...prev, payload]);
        if (onEventTriggered) {
          onEventTriggered(payload);
        }

        // NOTE: experiment_completed ONLY records interactive resource completion,
        // it DOES NOT directly auto-mark the entire lesson as completed.
        if (payload.event_type === "experiment_completed") {
          setResourceReportedCompleted(true);
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [bridge, capability, onEventTriggered]);

  const isMindMap = resource.resource_type === "mind_map_html";

  return (
    <Card className="border-primary/20 shadow-md overflow-hidden bg-card" dir="rtl" ref={containerRef}>
      <CardHeader className="bg-muted/30 border-b border-border/40 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {isMindMap ? (
                <Sparkles className="h-5 w-5 text-sky-500 shrink-0" />
              ) : (
                <Play className="h-5 w-5 text-emerald-500 shrink-0" />
              )}
              <CardTitle className="text-base font-bold text-foreground">
                {resource.title_ar}
              </CardTitle>
              <Badge variant="outline" className="text-[11px]">
                {isMindMap ? "خريطة ذهنية تفاعلية" : "تجربة عملية تفاعلية"}
              </Badge>
              {resource.offline_enabled && (
                <Badge variant="secondary" className="gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                  <DownloadCloud className="h-3 w-3" />
                  متاح دون اتصال
                </Badge>
              )}
            </div>
            {resource.description_ar && (
              <p className="text-xs text-muted-foreground">{resource.description_ar}</p>
            )}
            {isMindMap && resource.alt_text_ar && (
              <p className="text-[11px] text-muted-foreground/80 italic">
                الوصولية: {resource.alt_text_ar}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setLoading(true);
                setTimeout(() => setLoading(false), 300);
              }}
              title="إعادة تحميل المحتوى"
              disabled={!capability.allowed}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? "إنهاء العرض الكامل" : "عرض ملء الشاشة"}
              disabled={!capability.allowed}
            >
              {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0 relative">
        {/* Native Disabled Notice */}
        {!capability.allowed && (
          <div className="p-8 text-center bg-muted/20 space-y-3">
            <Lock className="mx-auto h-10 w-10 text-amber-500" />
            <p className="font-semibold text-sm text-foreground">{capability.userMessage}</p>
            <p className="text-xs text-muted-foreground">
              تم إيقاف تشغيل المحتوى التفاعلي احترازياً في البيئات غير المتوافقة لحماية الجلسة والبيانات.
            </p>
          </div>
        )}

        {/* Loading Overlay */}
        {capability.allowed && loading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/80 backdrop-blur-xs text-muted-foreground p-4">
            <RefreshCw className="h-8 w-8 animate-spin text-primary mb-2" />
            <p className="text-sm">جاري تهيئة بيئة العزل التفاعلية...</p>
          </div>
        )}

        {/* Error Overlay */}
        {capability.allowed && errorMsg && (
          <div className="p-6 text-center text-destructive space-y-3">
            <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
            <p className="font-semibold text-sm">{errorMsg}</p>
            <Button size="sm" variant="outline" onClick={() => setErrorMsg(null)}>
              <RotateCcw className="ml-2 h-4 w-4" />
              إعادة المحاولة
            </Button>
          </div>
        )}

        {/* Sandboxed Iframe Container */}
        {capability.allowed && !errorMsg && srcDoc && (
          <div className={`w-full transition-all ${isFullscreen ? "fixed inset-0 z-50 bg-background" : "h-[450px]"}`}>
            {isFullscreen && (
              <div className="absolute top-3 left-3 z-50">
                <Button size="sm" variant="secondary" onClick={() => setIsFullscreen(false)}>
                  <Minimize2 className="ml-1 h-4 w-4" /> إغلاق ملء الشاشة
                </Button>
              </div>
            )}

            {/* STRICT SECURITY ATTRIBUTES:
                - sandbox="allow-scripts" ONLY
                - NO allow-same-origin
                - NO allow-top-navigation
                - NO allow-forms
                - NO allow-popups
            */}
            <iframe
              ref={iframeRef}
              title={resource.title_ar}
              srcDoc={srcDoc}
              sandbox="allow-scripts"
              className="w-full h-full border-0 bg-background"
            />
          </div>
        )}

        {/* Security Isolation Indicator */}
        {capability.allowed && (
          <div className="flex items-center justify-between border-t border-border/40 px-4 py-2 bg-muted/20 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>محيط معزول آمن (Sandboxed Origin)</span>
            </div>

            {resourceReportedCompleted && (
              <div className="flex items-center gap-1 text-emerald-500 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>سجل المورد التفاعلي إكمال النشاط</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
