/**
 * Student-owned free-text answers for official lesson questions.
 *
 * Storage: public.lesson_question_notes (RLS scoped to auth.uid()).
 * The notebook never contains model answers — only what the student wrote.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import {
  readOfflineOfficialQuestionNotes,
  saveOfflineOfficialQuestionNote,
} from "@/lib/offline/offline-learning-journal";
import { syncOfflineOutboxForCurrentSession } from "@/lib/offline/offline-sync";

export type LessonQuestionNoteMap = Record<string, string>;

export function lessonQuestionNotesKey(lessonId: string, studentId: string | null) {
  return ["lesson-question-notes", lessonId, studentId] as const;
}

export function useLessonQuestionNotes(lessonId: string, studentId: string | null | undefined) {
  const queryClient = useQueryClient();
  const [savingIds, setSavingIds] = useState<string[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pending = useRef<Record<string, string>>({});
  const writes = useRef<Promise<void>>(Promise.resolve());

  const { data } = useQuery({
    enabled: Boolean(lessonId && studentId),
    queryKey: lessonQuestionNotesKey(lessonId, studentId ?? null),
    queryFn: async (): Promise<LessonQuestionNoteMap> => {
      const local = await readOfflineOfficialQuestionNotes(studentId!, lessonId);
      try {
        const { data: rows, error } = await supabase
          .from("lesson_question_notes")
          .select("question_id,answer_text")
          .eq("lesson_id", lessonId);
        if (error) throw error;
        const remote: LessonQuestionNoteMap = {};
        for (const row of rows ?? []) remote[row.question_id] = row.answer_text ?? "";
        return { ...remote, ...local };
      } catch {
        return local;
      }
    },
    networkMode: "always",
  });

  const notes = data ?? {};

  const persist = useCallback(
    (questionId: string) => {
      if (!studentId) return;
      const answerText = pending.current[questionId];
      if (answerText === undefined) return;
      delete pending.current[questionId];
      writes.current = writes.current
        .catch(() => undefined)
        .then(async () => {
          setSavingIds((ids) => (ids.includes(questionId) ? ids : [...ids, questionId]));
          try {
            await saveOfflineOfficialQuestionNote({
              ownerId: studentId,
              lessonId,
              questionId,
              answerText,
            });
            await syncOfflineOutboxForCurrentSession();
          } catch {
            /* Once committed, the durable operation remains queued for reconnect/focus retry. */
          } finally {
            setSavingIds((ids) => ids.filter((id) => id !== questionId));
          }
        });
    },
    [studentId, lessonId],
  );

  /** Debounced autosave (1s) so typing does not hammer the network. */
  const saveNote = useCallback(
    (questionId: string, answerText: string) => {
      if (!studentId) return;
      queryClient.setQueryData<LessonQuestionNoteMap>(
        lessonQuestionNotesKey(lessonId, studentId),
        (prev) => ({ ...(prev ?? {}), [questionId]: answerText }),
      );
      pending.current[questionId] = answerText;
      const existing = timers.current[questionId];
      if (existing) clearTimeout(existing);
      timers.current[questionId] = setTimeout(() => {
        delete timers.current[questionId];
        persist(questionId);
      }, 1000);
    },
    [lessonId, persist, queryClient, studentId],
  );

  useEffect(() => {
    const activeTimers = timers.current;
    return () => {
      for (const [questionId, timer] of Object.entries(activeTimers)) {
        clearTimeout(timer);
        persist(questionId);
      }
    };
  }, [persist]);

  return { notes, saveNote, savingIds };
}
