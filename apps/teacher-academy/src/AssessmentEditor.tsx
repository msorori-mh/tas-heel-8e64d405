import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";
import {
  adminAddAssessmentQuestion,
  adminDeleteAssessmentQuestion,
  adminGetAssessment,
  adminSaveAssessment,
  adminUpdateAssessmentQuestion,
} from "./lib/academy-api";
import type { AdminAssessmentQuestion } from "./types";

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String(error.message);
  }
  return "تعذرت العملية. حاول مرة أخرى.";
}

function correctAnswerOf(question: AdminAssessmentQuestion): string {
  if (question.correct_option === "a") return question.option_a ?? "";
  if (question.correct_option === "b") return question.option_b ?? "";
  if (question.correct_option === "c") return question.option_c ?? "";
  if (question.correct_option === "d") return question.option_d ?? "";
  return "";
}

export function AssessmentEditor({
  programVersionId,
  readOnly = false,
  defaultPassPercentage = 75,
}: {
  programVersionId: string;
  readOnly?: boolean;
  defaultPassPercentage?: number;
}) {
  const [questions, setQuestions] = useState<AdminAssessmentQuestion[]>([]);
  const [title, setTitle] = useState("التقييم النهائي");
  const [passPercentage, setPassPercentage] = useState(defaultPassPercentage);
  const [questionText, setQuestionText] = useState("");
  const [options, setOptions] = useState({ a: "", b: "", c: "", d: "" });
  const [correctOption, setCorrectOption] = useState<"a" | "b" | "c" | "d">("a");
  const [editingQuestion, setEditingQuestion] = useState<AdminAssessmentQuestion | null>(null);
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

  function clearQuestionForm() {
    setEditingQuestion(null);
    setQuestionText("");
    setOptions({ a: "", b: "", c: "", d: "" });
    setCorrectOption("a");
  }

  function editQuestion(question: AdminAssessmentQuestion) {
    if (!question.question_id) return;
    setEditingQuestion(question);
    setQuestionText(question.question_text ?? "");
    setOptions({
      a: question.option_a ?? "",
      b: question.option_b ?? "",
      c: question.option_c ?? "",
      d: question.option_d ?? "",
    });
    setCorrectOption(question.correct_option ?? "a");
  }

  async function saveQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminSaveAssessment(programVersionId, title.trim(), passPercentage);
      if (editingQuestion?.question_id) {
        await adminUpdateAssessmentQuestion({
          questionId: editingQuestion.question_id,
          questionText: questionText.trim(),
          optionA: options.a.trim(),
          optionB: options.b.trim(),
          optionC: options.c.trim(),
          optionD: options.d.trim(),
          correctOption,
        });
      } else {
        await adminAddAssessmentQuestion({
          programVersionId,
          questionText: questionText.trim(),
          optionA: options.a.trim(),
          optionB: options.b.trim(),
          optionC: options.c.trim(),
          optionD: options.d.trim(),
          correctOption,
        });
      }
      await reload();
      clearQuestionForm();
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
      {readOnly ? (
        <div className="preview-heading">
          <div>
            <h3>{title}</h3>
            <p className="muted">نسبة الاجتياز {passPercentage}%</p>
          </div>
          <span className="status live">{questions.length} سؤال</span>
        </div>
      ) : (
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
      )}

      <div className="data-list compact-list">
        {questions.map((question, index) => (
          <article className="data-row" key={question.question_id}>
            <div className="data-main">
              <strong>
                {index + 1}. {question.question_text}
              </strong>
              <small>
                الإجابة الصحيحة: {question.correct_option?.toUpperCase()} ·{" "}
                {correctAnswerOf(question)}
              </small>
            </div>
            {!readOnly ? (
              <div className="row-actions">
                <button
                  className="secondary-button"
                  type="button"
                  disabled={busy}
                  onClick={() => editQuestion(question)}
                >
                  <Pencil /> تعديل
                </button>
                <button
                  className="danger-button"
                  type="button"
                  disabled={busy}
                  onClick={() => removeQuestion(question)}
                >
                  <Trash2 /> حذف
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </div>

      {!readOnly ? (
        <form className="admin-form nested-form" onSubmit={saveQuestion}>
          <div className="section-toolbar compact-toolbar">
            <h3>{editingQuestion ? "تعديل سؤال الاختيارات" : "إضافة سؤال اختيارات"}</h3>
            {editingQuestion ? (
              <button
                className="text-button inline-text-button"
                type="button"
                onClick={clearQuestionForm}
              >
                إلغاء التعديل
              </button>
            ) : null}
          </div>
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
            {busy ? (
              <LoaderCircle className="spin" />
            ) : editingQuestion ? (
              <CheckCircle2 />
            ) : (
              <Plus />
            )}
            {editingQuestion ? "حفظ التعديل" : "إضافة السؤال"}
          </button>
        </form>
      ) : null}
    </section>
  );
}
