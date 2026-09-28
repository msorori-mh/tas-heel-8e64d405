import { useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Sigma } from "lucide-react";

import {
  insertMathToken,
  keysForScienceProfile,
  MATH_GROUP_LABELS,
  scienceInputProfile,
  shouldOfferMathKeyboard,
  type MathKey,
} from "@/lib/math-input/math-keyboard";
import { cn } from "@/lib/utils";

type Props = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  subjectName?: string | null;
  questionText?: string | null;
  questionType?: string | null;
  ariaLabel: string;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  disabled?: boolean;
  className?: string;
};

export function MathAnswerInput({
  id,
  value,
  onChange,
  subjectName,
  questionText,
  questionType,
  ariaLabel,
  placeholder = "اكتب إجابتك هنا…",
  rows = 4,
  maxLength,
  disabled = false,
  className,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const enabled = shouldOfferMathKeyboard({ subjectName, questionText, questionType });
  const profile = scienceInputProfile(subjectName);
  const keys = useMemo(() => keysForScienceProfile(profile), [profile]);
  const basicKeys = keys.filter((key) => key.group === "basic").slice(0, 14);
  const groupedKeys = useMemo(
    () =>
      Array.from(new Set(keys.map((key) => key.group))).map((group) => ({
        group,
        label: MATH_GROUP_LABELS[group],
        keys: keys.filter((key) => key.group === group),
      })),
    [keys],
  );

  const insert = (key: MathKey) => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? start;
    const next = insertMathToken({ value, start, end, key, maxLength });
    onChange(next.value);
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(next.cursor, next.cursor);
    });
  };

  return (
    <div className="space-y-2">
      <textarea
        ref={textareaRef}
        id={id}
        dir="auto"
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={(event) => {
          if (
            event.relatedTarget instanceof HTMLElement &&
            event.relatedTarget.closest("[data-math-keyboard]")
          ) {
            return;
          }
          setFocused(false);
        }}
        rows={rows}
        maxLength={maxLength}
        disabled={disabled}
        placeholder={placeholder}
        inputMode="text"
        autoCapitalize="none"
        spellCheck={false}
        className={cn(
          "w-full resize-y rounded-lg border border-border bg-card p-3 text-right text-sm leading-relaxed text-card-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15",
          className,
        )}
      />

      {enabled && (focused || expanded) ? (
        <div
          data-math-keyboard
          dir="rtl"
          className="sticky bottom-[calc(env(safe-area-inset-bottom)+0.25rem)] z-20 rounded-xl border border-primary/15 bg-card/95 p-2 shadow-lg backdrop-blur"
          onMouseDown={(event) => event.preventDefault()}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-primary">
              <Sigma className="h-3.5 w-3.5" aria-hidden />
              لوحة الرموز العلمية
            </span>
            <button
              type="button"
              className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-muted-foreground hover:bg-muted"
              onClick={() => setExpanded((current) => !current)}
            >
              {expanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronUp className="h-3.5 w-3.5" />
              )}
              {expanded ? "أقل" : "المزيد"}
            </button>
          </div>

          <div className="max-h-56 overflow-y-auto">
            {expanded ? (
              <div className="space-y-3">
                {groupedKeys.map((section) => (
                  <section key={section.group}>
                    <p className="mb-1.5 text-[10px] font-bold text-muted-foreground">
                      {section.label}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {section.keys.map((key) => (
                        <button
                          key={key.id}
                          type="button"
                          disabled={disabled}
                          aria-label={key.ariaLabel ?? key.label}
                          title={key.ariaLabel ?? key.label}
                          onClick={() => insert(key)}
                          className="min-h-10 min-w-10 rounded-lg border border-border bg-background px-2.5 text-sm font-bold text-foreground shadow-sm active:scale-95 disabled:opacity-50"
                        >
                          {key.label}
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {basicKeys.map((key) => (
                  <button
                    key={key.id}
                    type="button"
                    disabled={disabled}
                    aria-label={key.ariaLabel ?? key.label}
                    title={key.ariaLabel ?? key.label}
                    onClick={() => insert(key)}
                    className="min-h-10 min-w-10 rounded-lg border border-border bg-background px-2.5 text-sm font-bold text-foreground shadow-sm active:scale-95 disabled:opacity-50"
                  >
                    {key.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            الرموز مرتبة بحسب المادة والمنهج؛ استخدم «المزيد» لعرض الدوال والهندسة والوحدات والرموز المتخصصة.
          </p>
        </div>
      ) : enabled ? (
        <button
          type="button"
          className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-border bg-muted/40 px-3 text-[11px] font-semibold text-primary"
          onClick={() => {
            setExpanded(true);
            requestAnimationFrame(() => textareaRef.current?.focus());
          }}
        >
          <Sigma className="h-3.5 w-3.5" aria-hidden />
          إظهار الرموز الرياضية
        </button>
      ) : null}
    </div>
  );
}
