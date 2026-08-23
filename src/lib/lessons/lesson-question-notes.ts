/**
 * Student-owned free-text answers for official lesson questions.
 *
 * Storage: public.lesson_question_notes (RLS scoped to auth.uid()).
 * The notebook never contains model answers — only what the student wrote.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type LessonQuestionNoteMap = Record<string, string>;

export function lessonQuestionNotesKey(lessonId: string, studentId: string | null) {
  return ["lesson-question-notes", lessonId, studentId] as const;
}

export function useLessonQuestionNotes(lessonId: string, studentId: string | null | undefined) {
  const queryClient = useQueryClient();
  const [savingIds, setSavingIds] = useState<string[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const { data } = useQuery({
    enabled: Boolean(lessonId && studentId),
    queryKey: lessonQuestionNotesKey(lessonId, studentId ?? null),
    queryFn: async (): Promise<LessonQuestionNoteMap> => {
      const { data: rows, error } = await supabase
        .from("lesson_question_notes")
        .select("question_id,answer_text")
        .eq("lesson_id", lessonId);
      if (error) throw error;
      const map: LessonQuestionNoteMap = {};
      for (const row of rows ?? []) map[row.question_id] = row.answer_text ?? "";
      return map;
    },
  });

  const notes = data ?? {};

  const persist = useCallback(
    async (questionId: string, answerText: string) => {
      if (!studentId) return;
      setSavingIds((ids) => (ids.includes(questionId) ? ids : [...ids, questionId]));
      try {
        const { error } = await supabase.from("lesson_question_notes").upsert(
          {
            student_id: studentId,
            lesson_id: lessonId,
            question_id: questionId,
            answer_text: answerText,
          },
          { onConflict: "student_id,question_id" },
        );
        if (error) throw error;
        queryClient.setQueryData<LessonQuestionNoteMap>(
          lessonQuestionNotesKey(lessonId, studentId),
          (prev) => ({ ...(prev ?? {}), [questionId]: answerText }),
        );
      } catch {
        /* silent: the student keeps their local text, retried on next edit */
      } finally {
        setSavingIds((ids) => ids.filter((id) => id !== questionId));
      }
    },
    [lessonId, queryClient, studentId],
  );

  /** Debounced autosave (1s) so typing does not hammer the network. */
  const saveNote = useCallback(
    (questionId: string, answerText: string) => {
      if (!studentId) return;
      const existing = timers.current[questionId];
      if (existing) clearTimeout(existing);
      timers.current[questionId] = setTimeout(() => {
        delete timers.current[questionId];
        void persist(questionId, answerText);
      }, 1000);
    },
    [persist, studentId],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of Object.values(pending)) clearTimeout(timer);
    };
  }, []);

  return { notes, saveNote, savingIds };
}
