"use client";

import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle } from "lucide-react";

export interface ConfirmOptions {
  title: string;
  description?: string;
  /** Extra warning highlighted in a destructive/warning box. */
  warning?: string;
  confirmText?: string;
  cancelText?: string;
  /** Use destructive (red) confirm button. */
  destructive?: boolean;
}

type ConfirmState = ConfirmOptions & {
  open: boolean;
  resolve?: (v: boolean) => void;
};

let setter: ((s: ConfirmState) => void) | null = null;

/**
 * Imperative confirmation dialog. Returns a promise that resolves to
 * `true` when the user confirms and `false` when they cancel or close.
 *
 * The host (<ConfirmDialogHost />) must be mounted once in the app tree.
 */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  if (!setter) {
    // Fallback to native confirm if host is not mounted yet (shouldn't happen).
    return Promise.resolve(window.confirm(opts.title));
  }
  return new Promise<boolean>((resolve) => {
    setter!({ ...opts, open: true, resolve });
  });
}

export const ConfirmDialogHost = () => {
  const [state, setState] = useState<ConfirmState>({ title: "", open: false });

  useEffect(() => {
    setter = setState;
    return () => {
      setter = null;
    };
  }, []);

  const close = (result: boolean) => {
    state.resolve?.(result);
    setState((s) => ({ ...s, open: false, resolve: undefined }));
  };

  return (
    <AlertDialog
      open={state.open}
      onOpenChange={(o) => {
        if (!o) close(false);
      }}
    >
      <AlertDialogContent dir="rtl" className="text-right">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-right">{state.title}</AlertDialogTitle>
          {state.description && (
            <AlertDialogDescription className="text-right whitespace-pre-line">
              {state.description}
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>

        {state.warning && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span className="whitespace-pre-line">{state.warning}</span>
          </div>
        )}

        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel onClick={() => close(false)}>
            {state.cancelText || "إلغاء"}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => close(true)}
            className={
              state.destructive
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : ""
            }
          >
            {state.confirmText || "تأكيد"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
