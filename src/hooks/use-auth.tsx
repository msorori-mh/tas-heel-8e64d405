import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  user_id: string;
  full_name: string | null;
  grade_id: string | number | null;
  grade_uuid: string | null;
  governorate: string | null;
  governorate_id: string | null;
  curriculum_track_id: string | null;
  school_name: string | null;
  phone: string | null;
  avatar_url: string | null;
};

type AuthCtx = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isAdmin: boolean;
  profileComplete: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthCtx | undefined>(undefined);

function computeComplete(p: Profile | null): boolean {
  if (!p) return false;
  if (!p.full_name || !p.full_name.trim()) return false;
  if (!p.grade_id && !p.grade_uuid) return false;
  if (!p.governorate_id) return false;
  if (!p.curriculum_track_id) return false;
  return true;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const loadProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select(
        "id,user_id,full_name,grade_id,grade_uuid,governorate,governorate_id,curriculum_track_id,school_name,phone,avatar_url"
      )
      .eq("user_id", userId)
      .maybeSingle();
    setProfile((data as Profile | null) ?? null);

    const { data: adminCheck } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    setIsAdmin(Boolean(adminCheck));
  }, []);

  const refreshProfile = useCallback(async () => {
    const uid = session?.user?.id;
    if (uid) await loadProfile(uid);
  }, [session?.user?.id, loadProfile]);

  useEffect(() => {
    let mounted = true;

    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      if (!mounted) return;
      setSession(sess);
      if (event === "SIGNED_OUT" || !sess?.user) {
        setProfile(null);
        setIsAdmin(false);
      } else {
        setTimeout(() => {
          loadProfile(sess.user.id).catch(console.error);
        }, 0);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) {
        loadProfile(data.session.user.id).finally(() => {
          if (mounted) setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        loading,
        session,
        user: session?.user ?? null,
        profile,
        isAdmin,
        profileComplete: computeComplete(profile),
        refreshProfile,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
