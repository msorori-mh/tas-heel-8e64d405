import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { translateAuthError } from "@/lib/auth-helpers";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallback,
});

function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const url = new URL(window.location.href);
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));

        const errDesc =
          url.searchParams.get("error_description") || hash.get("error_description");
        const errCode = url.searchParams.get("error") || hash.get("error");
        if (errDesc || errCode) {
          throw new Error(errDesc || errCode || "OAuth error");
        }

        const code = url.searchParams.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
          if (error) throw error;
        }

        // hash tokens / setSession by detectSessionInUrl is default-on;
        // wait for session.
        for (let i = 0; i < 20; i++) {
          const { data } = await supabase.auth.getSession();
          if (data.session) break;
          await new Promise((r) => setTimeout(r, 150));
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("لم يتم العثور على جلسة");

        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name,grade_id,grade_uuid,governorate_id,curriculum_track_id")
          .eq("user_id", user.id)
          .maybeSingle();

        const complete =
          !!profile &&
          !!profile.full_name?.trim() &&
          (!!profile.grade_id || !!profile.grade_uuid) &&
          !!profile.governorate_id &&
          !!profile.curriculum_track_id;

        if (cancelled) return;
        navigate({ to: complete ? "/" : "/complete-profile", replace: true });
      } catch (e) {
        if (!cancelled) setError(translateAuthError(e));
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center">
        {error ? (
          <>
            <p className="text-destructive">{error}</p>
            <a href="/auth" className="mt-3 inline-block text-primary underline">
              العودة لتسجيل الدخول
            </a>
          </>
        ) : (
          <p className="text-muted-foreground">جارٍ إكمال تسجيل الدخول...</p>
        )}
      </div>
    </div>
  );
}
