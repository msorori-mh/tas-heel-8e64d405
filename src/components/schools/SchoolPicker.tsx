import { useEffect, useId, useState } from "react";
import {
  selectSchool,
  type School,
  type SchoolChoice,
  type SearchSchools,
} from "../../lib/schools/school-choice";
import "./school-picker.css";

export function SchoolPicker({
  value,
  onChange,
  governorateId,
  searchSchools,
  disabled = false,
}: {
  value: SchoolChoice;
  onChange: (value: SchoolChoice) => void;
  governorateId: string;
  searchSchools: SearchSchools;
  disabled?: boolean;
}) {
  const id = useId();
  const [results, setResults] = useState<School[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const selected = value.mode === "selected";

  useEffect(() => {
    let active = true;
    setResults([]);
    setError(false);
    if (!governorateId || selected || disabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      searchSchools(governorateId, value.school_name, value.school_district)
        .then((rows) => {
          if (active) setResults(rows);
        })
        .catch(() => {
          if (active) setError(true);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    governorateId,
    selected,
    disabled,
    value.school_name,
    value.school_district,
    searchSchools,
    retry,
  ]);

  return (
    <fieldset className="school-picker" disabled={disabled || !governorateId} dir="rtl">
      <legend>المدرسة</legend>
      {!governorateId && <p>اختر المحافظة أولًا لتظهر مدارسها.</p>}
      {selected ? (
        <div className="school-picker-selection">
          <strong>{value.school_name}</strong>
          <span>{[value.school_district, value.school_locality].filter(Boolean).join(" — ")}</span>
          <button
            type="button"
            onClick={() => onChange({ ...value, school_id: null, mode: "search" })}
          >
            تغيير المدرسة
          </button>
        </div>
      ) : (
        <>
          <label htmlFor={`${id}-name`}>
            {value.mode === "proposal" ? "اسم المدرسة المقترحة" : "ابحث باسم المدرسة"}
          </label>
          <input
            id={`${id}-name`}
            value={value.school_name}
            maxLength={180}
            autoComplete="off"
            placeholder="اكتب اسم المدرسة"
            onChange={(event) =>
              onChange({ ...value, school_id: null, school_name: event.target.value })
            }
          />
          <label htmlFor={`${id}-district`}>
            المديرية{value.mode === "search" ? " (اختياري لتضييق البحث)" : ""}
          </label>
          <input
            id={`${id}-district`}
            value={value.school_district}
            maxLength={120}
            autoComplete="off"
            onChange={(event) => onChange({ ...value, school_district: event.target.value })}
          />
          <div aria-live="polite" className="school-picker-feedback">
            {loading ? (
              <p>جارٍ البحث عن المدارس…</p>
            ) : error ? (
              <p role="alert">
                تعذّر تحميل المدارس.{" "}
                <button type="button" onClick={() => setRetry((n) => n + 1)}>
                  إعادة المحاولة
                </button>
              </p>
            ) : results.length ? (
              <>
                <p>
                  {value.mode === "proposal"
                    ? "هل تقصد إحدى هذه المدارس؟"
                    : "اختر مدرستك من النتائج:"}
                </p>
                <ul>
                  {results.map((school) => (
                    <li key={school.id}>
                      <button type="button" onClick={() => onChange(selectSchool(school))}>
                        <strong>{school.name}</strong>
                        <span>
                          {school.district} — {school.locality}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                {results.length === 25 && (
                  <p>اكتب مزيدًا من الاسم أو حدّد المديرية لتضييق النتائج.</p>
                )}
              </>
            ) : governorateId ? (
              <p>لا توجد مدارس معتمدة مطابقة للبحث.</p>
            ) : null}
          </div>
          {value.mode === "proposal" ? (
            <>
              <label htmlFor={`${id}-locality`}>الحي أو القرية</label>
              <input
                id={`${id}-locality`}
                value={value.school_locality}
                maxLength={120}
                onChange={(event) => onChange({ ...value, school_locality: event.target.value })}
              />
              <p>يمكنك إكمال التسجيل الآن. ستراجع الإدارة المدرسة قبل إضافتها إلى الدليل.</p>
              <button type="button" onClick={() => onChange({ ...value, mode: "search" })}>
                العودة لاختيار مدرسة موجودة
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onChange({ ...value, school_id: null, mode: "proposal" })}
            >
              لم أجد مدرستي
            </button>
          )}
        </>
      )}
    </fieldset>
  );
}
