import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppHome,
});

function AppHome() {
  const navigate = useNavigate();
  const { loading, profile, profileComplete, isAdmin, signOut } = useAuth();

  useEffect(() => {
    if (!loading && !profileComplete && !isAdmin) {
      navigate({ to: "/complete-profile", replace: true });
    }
  }, [loading, profileComplete, isAdmin, navigate]);

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-2xl rounded-2xl border bg-card p-6 shadow-card">
        <h1 className="text-2xl font-bold">مرحباً {profile?.full_name ?? ""}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          المنطقة المحمية جاهزة. سيتم بناء واجهات الطالب في المرحلة التالية.
        </p>
        <div className="mt-4 flex gap-2">
          <Button asChild variant="outline"><Link to="/">الرئيسية</Link></Button>
          <Button variant="outline" onClick={() => signOut()}>تسجيل الخروج</Button>
        </div>
      </div>
    </div>
  );
}
