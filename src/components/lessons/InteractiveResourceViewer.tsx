import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Maximize2,
  Minimize2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Play,
  CheckCircle2,
  AlertTriangle,
  DownloadCloud,
  Lock,
  FileText,
} from "lucide-react";
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
  resource_type: "mind_map_html" | "practical_experiment_html" | "summary_html";
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

  // Session state containing iframe generation, cryptographic nonce, and active bridge
  const [session, setSession] = useState<{
    generation: number;
    nonce: string;
    bridge: AppInteractiveResourceBridge | null;
  }>(() => {
    try {
      const n = generateSessionNonce();
      return {
        generation: 1,
        nonce: n,
        bridge: new AppInteractiveResourceBridge(resource.resource_code, resource.version, n),
      };
    } catch {
      return { generation: 1, nonce: "", bridge: null };
    }
  });

  // activeWindow is strictly bound ONLY after iframe onLoad event fires for the active generation
  const [activeWindow, setActiveWindow] = useState<WindowProxy | null>(null);

  const [eventsLog, setEventsLog] = useState<BridgeEventPayload[]>([]);
  const [resourceReportedCompleted, setResourceReportedCompleted] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [srcDoc, setSrcDoc] = useState("");

  const handleReload = () => {
    try {
      const newNonce = generateSessionNonce();
      const newBridge = new AppInteractiveResourceBridge(
        resource.resource_code,
        resource.version,
        newNonce,
      );
      // Fail-closed: unbind expected window, clear completion and logs, reset loading
      setActiveWindow(null);
      setResourceReportedCompleted(false);
      setEventsLog([]);
      setLoading(true);
      setErrorMsg(null);
      setSrcDoc("");
      setSession((prev) => ({
        generation: prev.generation + 1,
        nonce: newNonce,
        bridge: newBridge,
      }));
    } catch (err: any) {
      setErrorMsg("فشل تهيئة التشفير الآمن عند إعادة التحميل.");
    }
  };

  // Re-initialize session if resource prop changes
  const prevResourceKey = useRef(`${resource.resource_code}-${resource.version}`);
  useEffect(() => {
    const currentKey = `${resource.resource_code}-${resource.version}`;
    if (prevResourceKey.current !== currentKey) {
      prevResourceKey.current = currentKey;
      handleReload();
    }
  }, [resource.resource_code, resource.version]);

  // Generate safe srcDoc bundle with CSP meta and client bridge script
  useEffect(() => {
    if (!capability.allowed) {
      setErrorMsg(capability.userMessage || "المحتوى التفاعلي غير مدعوم في هذه البيئة.");
      setLoading(false);
      return;
    }

    if (!session.nonce || !session.bridge) {
      setErrorMsg("فشل تهيئة التشفير الآمن (Cryptographic Nonce missing). البيئة غير آمنة.");
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setErrorMsg(null);
    setActiveWindow(null);

    buildPackageCsp([], resource.resource_code, resource.version, session.nonce)
      .then((csp) => {
        if (!isMounted) return;
        const bundle = generatePreviewHtmlBundle(
          resource.html_content,
          [],
          csp,
          resource.resource_code,
          resource.version,
          session.nonce,
        );
        setSrcDoc(bundle);
      })
      .catch((err: any) => {
        if (!isMounted) return;
        setErrorMsg(err.message || "حدث خطأ أثناء بناء سياسة الأمان CSP.");
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [
    resource.resource_code,
    resource.version,
    resource.html_content,
    session.generation,
    session.nonce,
    session.bridge,
    capability,
  ]);

  // Listen for window postMessage events from sandboxed iframe
  useEffect(() => {
    if (!session.bridge || !capability.allowed) return;

    const handleMessage = (event: MessageEvent) => {
      // Validate session nonce, origin, and exact activeWindow (null until onLoad)
      const validation = session.bridge!.validateEventPayload(
        event.data,
        event.source as WindowProxy | null,
        activeWindow,
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
  }, [session.bridge, capability, activeWindow, onEventTriggered]);

  const handleIframeLoad = () => {
    if (iframeRef.current?.contentWindow) {
      setActiveWindow(iframeRef.current.contentWindow);
    }
    setLoading(false);
  };

  const isMindMap = resource.resource_type === "mind_map_html";
  const isSummary = resource.resource_type === "summary_html";

  return (
    <Card
      className="border-primary/20 shadow-md overflow-hidden bg-card"
      dir="rtl"
      ref={containerRef}
    >
      <CardHeader className="bg-muted/30 border-b border-border/40 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {isMindMap ? (
                <Sparkles className="h-5 w-5 text-sky-500 shrink-0" />
              ) : isSummary ? (
                <FileText className="h-5 w-5 text-violet-500 shrink-0" />
              ) : (
                <Play className="h-5 w-5 text-emerald-500 shrink-0" />
              )}
              <CardTitle className="text-base font-bold text-foreground">
                {resource.title_ar}
              </CardTitle>
              <Badge variant="outline" className="text-[11px]">
                {isMindMap
                  ? "خريطة ذهنية تفاعلية"
                  : isSummary
                    ? "ملخص تفاعلي"
                    : "تجربة عملية تفاعلية"}
              </Badge>
              {resource.offline_enabled && (
                <Badge
                  variant="secondary"
                  className="gap-1 text-[10px] text-emerald-600 dark:text-emerald-400"
                >
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
              onClick={handleReload}
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
              {isFullscreen ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
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
              تم إيقاف تشغيل المحتوى التفاعلي احترازياً في البيئات غير المتوافقة لحماية الجلسة
              والبيانات.
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
            <Button size="sm" variant="outline" onClick={handleReload}>
              <RotateCcw className="ml-2 h-4 w-4" />
              إعادة المحاولة
            </Button>
          </div>
        )}

        {/* Sandboxed Iframe Container */}
        {capability.allowed && !errorMsg && srcDoc && (
          <div
            className={`w-full transition-all ${isFullscreen ? "fixed inset-0 z-50 bg-background" : "h-[450px]"}`}
          >
            {isFullscreen && (
              <div className="absolute top-3 left-3 z-50">
                <Button size="sm" variant="secondary" onClick={() => setIsFullscreen(false)}>
                  <Minimize2 className="ml-1 h-4 w-4" /> إغلاق ملء الشاشة
                </Button>
              </div>
            )}

            {/* STRICT SECURITY ATTRIBUTES:
                - key ensures physical DOM element unmount/remount on reload
                - sandbox="allow-scripts" ONLY
                - NO allow-same-origin
                - NO allow-top-navigation
                - NO allow-forms
                - NO allow-popups
            */}
            <iframe
              key={`${resource.resource_code}-${resource.version}-${session.generation}`}
              data-iframe-generation={session.generation}
              ref={iframeRef}
              title={resource.title_ar}
              srcDoc={srcDoc}
              sandbox="allow-scripts"
              onLoad={handleIframeLoad}
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
