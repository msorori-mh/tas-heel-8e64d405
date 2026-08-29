import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, LoaderCircle, Plus, Trash2 } from "lucide-react";
import {
  adminAddAssessmentQuestion,
  adminDeleteAssessmentQuestion,
  adminGetAssessment,
  adminSaveAssessment,
} from "./lib/academy-api";
import type { AdminAssessmentQuestion } from "./types";

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String(error.message);
  }
  return "تعذرت العملية. حاول مرة أخرى.";
}

export function AssessmentEditor({ programVersionId }: { programVersionId: string }) {
  const [questions, setQuestions] = useState<AdminAssessmentQuestion[]>([]);
  const [title, setTitle] = useState("التقييم النهائي");
  const [passPercentage, setPassPercentage] = useState(70);
  const [questionText, setQuestionText] = useState("");
  const [options, setOptions] = useState({ a: "", b: "", c: "", d: "" });
  const [correctOption, setCorrectOption] = useState<"a" | "b" | "c" | "d">("a");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const items = await adminGetAssessment(programVersionId);
    setQuestions(items.filter((item) => item.question_id));
    if (items[0]) {
      setTitle(items[0].assessment_title);
      setPassPercentage(items[0].pass_percentage);
    }
  }

  useEffect(() => {
    let active = true;
    adminGetAssessment(programVersionId)
      .then((items) => {
        if (!active) return;
        setQuestions(items.filter((item) => item.question_id));
        if (items[0]) {
          setTitle(items[0].assessment_title);
          setPassPercentage(items[0].pass_percentage);
        }
      })
      .catch((loadError) => active && setError(messageOf(loadError)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [programVersionId]);

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminSaveAssessment(programVersionId, title.trim(), passPercentage);
      await reload();
    } catch (saveError) {
      setError(messageOf(saveError));
    } finally {
      setBusy(false);
    }
  }

  async function addQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminSaveAssessment(programVersionId, title.trim(), passPercentage);
      await adminAddAssessmentQuestion({
        programVersionId,
        questionText: questionText.trim(),
        optionA: options.a.trim(),
        optionB: options.b.trim(),
        optionC: options.c.trim(),
        optionD: options.d.trim(),
        correctOption,
      });
      await reload();
      setQuestionText("");
      setOptions({ a: "", b: "", c: "", d: "" });
      setCorrectOption("a");
    } catch (addError) {
      setError(messageOf(addError));
    } finally {
      setBusy(false);
    }
  }

  async function removeQuestion(question: AdminAssessmentQuestion) {
    if (!question.question_id || !window.confirm("حذف هذا السؤال؟")) return;
    setBusy(true);
    setError(null);
    try {
      await adminDeleteAssessmentQuestion(question.question_id);
      await reload();
    } catch (deleteError) {
      setError(messageOf(deleteError));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="loading-inline">
        <LoaderCircle className="spin" /> جارٍ تحميل التقييم…
      </div>
    );
  }

  return (
    <section className="assessment-admin">
      <form className="admin-form nested-form" onSubmit={saveSettings}>
        <h3>إعداد التقييم النهائي</h3>
        <div className="form-grid">
          <label>
            عنوان التقييم
            <input value={title} onChange={(event) => setTitle(event.target.value)} required />
          </label>
          <label>
            نسبة النجاح
            <input
              type="number"
              min={1}
              max={100}
              value={passPercentage}
              onChange={(event) => setPassPercentage(Number(event.target.value))}
              required
            />
          </label>
        </div>
        <button className="secondary-button" type="submit" disabled={busy}>
          <CheckCircle2 /> حفظ الإعدادات
        </button>
      </form>

      <div className="data-list compact-list">
        {questions.map((question, index) => (
          <article className="data-row" key={question.question_id}>
            <div className="data-main">
              <strong>
                {index + 1}. {question.question_text}
              </strong>
              <small>الإجابة الصحيحة: {question.correct_option?.toUpperCase()}</small>
            </div>
            <button
              className="danger-button"
              type="button"
              disabled={busy}
              onClick={() => removeQuestion(question)}
            >
              <Trash2 /> حذف
            </button>
          </article>
        ))}
      </div>

      <form className="admin-form nested-form" onSubmit={addQuestion}>
        <h3>إضافة سؤال اختيارات</h3>
        <label>
          نص السؤال
          <textarea
            value={questionText}
            onChange={(event) => setQuestionText(event.target.value)}
            required
          />
        </label>
        <div className="form-grid assessment-options-admin">
          {(["a", "b", "c", "d"] as const).map((option) => (
            <label key={option}>
              الخيار {option.toUpperCase()}
              <input
                value={options[option]}
                onChange={(event) =>
                  setOptions((current) => ({ ...current, [option]: event.target.value }))
                }
                required
              />
            </label>
          ))}
          <label>
            الإجابة الصحيحة
            <select
              value={correctOption}
              onChange={(event) => setCorrectOption(event.target.value as typeof correctOption)}
            >
              <option value="a">A</option>
              <option value="b">B</option>
              <option value="c">C</option>
              <option value="d">D</option>
            </select>
          </label>
        </div>
        {error ? <div className="notice error-notice">{error}</div> : null}
        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? <LoaderCircle className="spin" /> : <Plus />} إضافة السؤال
        </button>
      </form>
    </section>
  );
}
