import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
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
  readingKey,
}: {
  actions: LessonCapability[];
  renderBody: (capability: LessonCapability) => React.ReactNode;
  waitingForPrimary: boolean;
  readingKey?: string;
}) {
  const tabListRef = useRef<HTMLDivElement>(null);
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

  const positions = useRef<Partial<Record<LessonCapabilityType, number>>>({});
  const restored = useRef(false);
  useEffect(() => {
    if (!readingKey || restored.current || !actions.length || waitingForPrimary) return;
    restored.current = true;
    try {
      const saved = JSON.parse(localStorage.getItem(readingKey) || "null");
      if (saved && actions.some((item) => item.type === saved.type)) {
        positions.current = saved.positions || {};
        setHasManualSelection(true);
        setActiveType(saved.type);
        setVisitedTypes((current) => new Set(current).add(saved.type));
        requestAnimationFrame(() =>
          window.scrollTo({
            top: Number(positions.current[saved.type as LessonCapabilityType]) || 0,
          }),
        );
      }
    } catch {
      /* Reading remains available if storage is unavailable. */
    }
  }, [readingKey, actions, waitingForPrimary]);
  useEffect(() => {
    if (!readingKey || !activeType) return;
    let timer: ReturnType<typeof setTimeout>;
    const save = () => {
      positions.current[activeType] = window.scrollY;
      try {
        localStorage.setItem(
          readingKey,
          JSON.stringify({ type: activeType, positions: positions.current }),
        );
      } catch {
        /* Optional preference. */
      }
    };
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(save, 200);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", save);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", save);
    };
  }, [readingKey, activeType]);

  const selectTab = (type: LessonCapabilityType) => {
    if (activeType) positions.current[activeType] = window.scrollY;
    if (readingKey) {
      try {
        localStorage.setItem(readingKey, JSON.stringify({ type, positions: positions.current }));
      } catch {
        /* Optional preference. */
      }
    }
    setHasManualSelection(true);
    setActiveType(type);
    setVisitedTypes((current) => new Set(current).add(type));
    requestAnimationFrame(() => {
      document
        .getElementById(`lesson-tab-${type}`)
        ?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      window.scrollTo({
        top:
          positions.current[type] ??
          Math.max(0, (tabListRef.current?.getBoundingClientRect().top ?? 0) + window.scrollY),
        behavior: "instant",
      });
    });
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
    <section aria-label="محتويات الدرس" className="min-w-0 bg-background">
      <div
        ref={tabListRef}
        role="tablist"
        aria-label="محتويات الدرس"
        aria-orientation="horizontal"
        className="sticky top-[var(--lesson-reader-top,0px)] lg:top-0 z-20 flex w-full gap-1 overflow-x-auto border-b border-border bg-background/95 py-2 backdrop-blur-md"
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
              className={`flex min-h-11 shrink-0 items-center justify-start gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg ${
                  active ? "bg-primary-foreground/15" : "bg-primary/10 text-primary"
                }`}
              >
                <CapabilityIcon type={capability.type} />
              </span>
              <span className="min-w-0 text-start leading-relaxed">{capability.label}</span>
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
            className="py-4"
          >
            {renderBody(capability)}
          </div>
        );
      })}
      <nav
        aria-label="التنقل بين مكونات الدرس"
        className="flex justify-between gap-2 border-t border-border py-4"
      >
        {actions.map((item, index) => {
          const activeIndex = actions.findIndex((action) => action.type === activeType);
          if (Math.abs(index - activeIndex) !== 1) return null;
          const previous = index < activeIndex;
          return (
            <button
              key={item.type}
              type="button"
              onClick={() => selectTab(item.type)}
              className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm text-primary"
            >
              {previous && <ChevronRight className="h-4 w-4" aria-hidden />}
              {previous ? "السابق" : "التالي"}: {item.label}
              {!previous && <ChevronLeft className="h-4 w-4" aria-hidden />}
            </button>
          );
        })}
      </nav>
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
