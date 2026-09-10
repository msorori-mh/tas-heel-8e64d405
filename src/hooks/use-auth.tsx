import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, readOfflineSession, signOutOnThisDevice } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { readOfflineView, saveOfflineView } from "@/lib/offline/offline-view-cache";
import { deriveAuthRoles } from "@/lib/auth-roles";
import { setActiveOfflineOwner } from "@/lib/offline/offline-state-store";

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
  isContentManager: boolean;
  isContentStaff: boolean;
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
  const queryClient = useQueryClient();
  const activeUser = useRef<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isContentManager, setIsContentManager] = useState(false);
  const [isContentStaff, setIsContentStaff] = useState(false);

  const loadProfile = useCallback(async (userId: string) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 12_000);
    const current = () => activeUser.current === userId && request.current === controller;
    try {
      if (!navigator.onLine) {
        const saved = await readOfflineView<Profile>(userId, "student-profile");
        if (current()) setProfile(saved?.user_id === userId ? saved : null);
        return; // roles remain false; cached display data never grants privileges
      }
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id,user_id,full_name,grade_id,grade_uuid,governorate,governorate_id,curriculum_track_id,school_name,phone,avatar_url",
        )
        .eq("user_id", userId)
        .abortSignal(controller.signal)
        .maybeSingle();
      if (error) throw error;
      if (!current()) return;
      setProfile((data as Profile | null) ?? null);
      if (data) await saveOfflineView(userId, "student-profile", data).catch(() => undefined);
      const [{ data: adminCheck }, { data: contentManagerCheck }] = await Promise.all([
        supabase
          .rpc("has_role", { _user_id: userId, _role: "admin" })
          .abortSignal(controller.signal),
        supabase
          .rpc("has_role", { _user_id: userId, _role: "content_manager" })
          .abortSignal(controller.signal),
      ]);
      if (!current()) return;
      const roles = deriveAuthRoles({
        hasAdmin: adminCheck === true,
        hasContentManager: contentManagerCheck === true,
      });
      setIsAdmin(roles.isAdmin);
      setIsContentManager(roles.isContentManager);
      setIsContentStaff(roles.isContentStaff);
    } finally {
      clearTimeout(timeout);
      if (current()) setLoading(false);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (activeUser.current) await loadProfile(activeUser.current);
  }, [loadProfile]);

  useEffect(() => {
    let mounted = true;
    let generation = 0;
    async function acceptSession(next: Session | null) {
      const version = ++generation;
      const uid = next?.user.id ?? null;
      setLoading(true);
      if (activeUser.current !== uid) {
        request.current?.abort();
        queryClient.clear();
        setProfile(null);
        setIsAdmin(false);
        setIsContentManager(false);
        setIsContentStaff(false);
      }
      activeUser.current = uid;
      setSession(next);
      try {
        // Local persistence is separate from Google authentication. A storage
        // failure must not replace the working original online workspace.
        await setActiveOfflineOwner(uid).catch(() => undefined);
        if (!mounted || version !== generation) return;
        if (uid) await loadProfile(uid);
      } catch {
        // The existing profile page handles retry; never leave login spinning.
      } finally {
        if (mounted && version === generation) setLoading(false);
      }
    }
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (!mounted) return;
      // INITIAL_SESSION is handled below, including an expired offline session.
      if (event === "INITIAL_SESSION") return;
      if (event === "TOKEN_REFRESHED" && next?.user.id === activeUser.current) {
        setSession(next);
        return;
      }
      setTimeout(() => {
        if (mounted) void acceptSession(next);
      }, 0);
    });
    void (async () => {
      const offline = await readOfflineSession();
      if (!mounted || generation > 0) return;
      if (offline) {
        await acceptSession(offline);
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (mounted && generation === 0) await acceptSession(data.session);
    })().catch(() => {
      if (mounted) setLoading(false);
    });
    const reconnect = () => {
      void refreshProfile().catch(() => undefined);
    };
    const disconnected = () => {
      setIsAdmin(false);
      setIsContentManager(false);
      setIsContentStaff(false);
    };
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", disconnected);
    return () => {
      mounted = false;
      request.current?.abort();
      sub.subscription.unsubscribe();
      window.removeEventListener("online", reconnect);
      window.removeEventListener("offline", disconnected);
    };
  }, [loadProfile, refreshProfile, queryClient]);

  const signOut = useCallback(async () => {
    await setActiveOfflineOwner(null);
    await signOutOnThisDevice();
    queryClient.clear();
  }, [queryClient]);

  return (
    <AuthContext.Provider
      value={{
        loading,
        session,
        user: session?.user ?? null,
        profile,
        isAdmin,
        isContentManager,
        isContentStaff,
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
