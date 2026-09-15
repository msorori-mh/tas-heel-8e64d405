import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ScrollText,
  FileText,
  Sparkles,
  Map as MapIcon,
  FlaskConical,
  Video,
  Target,
  Trophy,
  Library,
} from "lucide-react";
import type { LessonCapability, LessonCapabilityType } from "@/lib/lessons/lesson-capabilities";

export function LessonCapabilityTabs({
  actions,
  renderBody,
  waitingForPrimary,
}: {
  actions: LessonCapability[];
  renderBody: (capability: LessonCapability) => React.ReactNode;
  waitingForPrimary: boolean;
}) {
  const tabListRef = useRef<HTMLDivElement>(null);
  const [showReturn, setShowReturn] = useState(false);

  useEffect(() => {
    const tabList = tabListRef.current;
    if (!tabList) return;
    const observer = new IntersectionObserver(([entry]) => {
      setShowReturn(!entry.isIntersecting && entry.boundingClientRect.bottom < 0);
    });
    observer.observe(tabList);
    return () => observer.disconnect();
  }, []);

  const returnToComponents = () => {
    tabListRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
    tabListRef.current
      ?.querySelector<HTMLButtonElement>('[aria-selected="true"]')
      ?.focus({ preventScroll: true });
  };

  const firstType = waitingForPrimary ? null : (actions[0]?.type ?? null);
  const [activeType, setActiveType] = useState<LessonCapabilityType | null>(firstType);
  const [visitedTypes, setVisitedTypes] = useState<Set<LessonCapabilityType>>(
    () => new Set(firstType ? [firstType] : []),
  );
  const [hasManualSelection, setHasManualSelection] = useState(false);

  useEffect(() => {
    const preferredType =
      actions.find((capability) => capability.type === "PRIMARY_CONTENT")?.type ??
      (waitingForPrimary ? null : actions[0]?.type) ??
      null;
    const activeStillAvailable =
      activeType && actions.some((capability) => capability.type === activeType);
    if (activeStillAvailable && (hasManualSelection || activeType === preferredType)) return;
    const nextType = preferredType;
    setActiveType(nextType);
    if (nextType) {
      setVisitedTypes((current) => new Set(current).add(nextType));
    }
  }, [actions, activeType, hasManualSelection, waitingForPrimary]);

  const selectTab = (type: LessonCapabilityType) => {
    setHasManualSelection(true);
    setActiveType(type);
    setVisitedTypes((current) => new Set(current).add(type));
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const rtlStep = event.key === "ArrowRight" ? -1 : 1;
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? actions.length - 1
          : (index + rtlStep + actions.length) % actions.length;
    const nextType = actions[nextIndex]?.type;
    if (!nextType) return;
    selectTab(nextType);
    document.getElementById(`lesson-tab-${nextType}`)?.focus();
  };

  return (
    <section
      aria-label="محتويات الدرس"
      className="min-w-0 rounded-2xl border border-border bg-card shadow-card"
    >
      <div
        ref={tabListRef}
        role="tablist"
        aria-label="محتويات الدرس"
        aria-orientation="horizontal"
        className="grid w-full scroll-mt-20 grid-cols-2 gap-2 rounded-t-2xl border-b border-border bg-muted/20 p-2 sm:grid-cols-3 xl:grid-cols-4"
      >
        {actions.map((capability, index) => {
          const active = capability.type === activeType;
          return (
            <button
              key={capability.type}
              id={`lesson-tab-${capability.type}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`lesson-panel-${capability.type}`}
              tabIndex={active ? 0 : -1}
              onClick={() => selectTab(capability.type)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              className={`flex min-h-14 min-w-0 items-center justify-start gap-2 rounded-xl px-2 py-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <span
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                  active ? "bg-primary-foreground/15" : "bg-primary/10 text-primary"
                }`}
              >
                <CapabilityIcon type={capability.type} />
              </span>
              <span className="min-w-0 text-start leading-relaxed">{capability.label}</span>
              <span className={`text-[10px] ${active ? "opacity-80" : "text-muted-foreground"}`}>
                {index + 1}
              </span>
            </button>
          );
        })}
      </div>

      {actions.map((capability) => {
        if (!visitedTypes.has(capability.type)) return null;
        const active = capability.type === activeType;
        return (
          <div
            key={capability.type}
            id={`lesson-panel-${capability.type}`}
            role="tabpanel"
            aria-labelledby={`lesson-tab-${capability.type}`}
            hidden={!active}
            className="bg-background/40 p-3 sm:p-4"
          >
            <div className="mb-4 flex items-start gap-3 border-b border-border/60 pb-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <CapabilityIcon type={capability.type} />
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground">{capability.label}</h2>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {capability.description}
                </p>
              </div>
            </div>
            {renderBody(capability)}
          </div>
        );
      })}
      {showReturn && (
        <button
          type="button"
          onClick={returnToComponents}
          className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-4 z-30 flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-primary shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:bottom-6"
        >
          <ArrowUp className="h-4 w-4" aria-hidden />
          مكونات الدرس
        </button>
      )}
    </section>
  );
}

/** Icon per capability — presentation only, derived from the capability type. */
function CapabilityIcon({ type }: { type: LessonCapabilityType }) {
  const className = "h-5 w-5";
  switch (type) {
    case "PRIMARY_CONTENT":
      return <ScrollText className={className} />;
    case "SUMMARY":
      return <FileText className={className} />;
    case "EXPLANATION":
      return <Sparkles className={className} />;
    case "MINDMAP":
      return <MapIcon className={className} />;
    case "PRACTICAL":
      return <FlaskConical className={className} />;
    case "VIDEO":
      return <Video className={className} />;
    case "OFFICIAL_QUESTIONS":
      return <Target className={className} />;
    case "SELF_TEST":
      return <Trophy className={className} />;
    default:
      return <Library className={className} />;
  }
}
