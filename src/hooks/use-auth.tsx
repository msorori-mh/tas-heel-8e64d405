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
import { supabase } from "@/integrations/supabase/client";
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
  school_id?: string | null;
  school_district?: string | null;
  school_locality?: string | null;
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
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isContentManager, setIsContentManager] = useState(false);
  const [isContentStaff, setIsContentStaff] = useState(false);
  const owner = useRef<string | null>(null);
  const generation = useRef(0);
  const inFlight = useRef<{ generation: number; promise: Promise<void> } | null>(null);

  const loadProfile = useCallback((userId: string, force = false): Promise<void> => {
    if (owner.current !== userId) return Promise.resolve();
    // An explicit refresh after editing a profile must supersede older reads.
    if (force) generation.current += 1;
    const currentGeneration = generation.current;
    if (inFlight.current?.generation === currentGeneration) return inFlight.current.promise;

    // Independent requests share one network round trip. Concurrent auth
    // notifications reuse this promise, never a previous account's result.
    const promise = (async () => {
      const [profileResult, adminResult, managerResult] = await Promise.all([
        supabase
          .from("profiles")
          .select(
            "id,user_id,full_name,grade_id,grade_uuid,governorate,governorate_id,curriculum_track_id,school_name,school_id,school_district,school_locality,phone,avatar_url",
          )
          .eq("user_id", userId)
          .maybeSingle(),
        supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
        supabase.rpc("has_role", { _user_id: userId, _role: "content_manager" }),
      ]);
      if (generation.current !== currentGeneration || owner.current !== userId) return;
      setProfile(profileResult.error ? null : ((profileResult.data as Profile | null) ?? null));
      const roles = deriveAuthRoles({
        hasAdmin: !adminResult.error && adminResult.data === true,
        hasContentManager: !managerResult.error && managerResult.data === true,
      });
      setIsAdmin(roles.isAdmin);
      setIsContentManager(roles.isContentManager);
      setIsContentStaff(roles.isContentStaff);
    })().finally(() => {
      if (generation.current === currentGeneration) {
        inFlight.current = null;
        setLoading(false);
      }
    });
    inFlight.current = { generation: currentGeneration, promise };
    return promise;
  }, []);

  const refreshProfile = useCallback(async () => {
    const uid = session?.user?.id;
    if (uid) await loadProfile(uid, true);
  }, [session?.user?.id, loadProfile]);

  useEffect(() => {
    let mounted = true;
    let receivedAuthEvent = false;
    let initialized = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const queuedLoads = new Set<number>();

    const acceptSession = (sess: Session | null, refresh = false) => {
      if (!mounted) return;
      const uid = sess?.user?.id ?? null;
      const changed = !initialized || owner.current !== uid;
      initialized = true;
      setSession(sess);
      if (changed) {
        owner.current = uid;
        generation.current += 1;
        inFlight.current = null;
        void setActiveOfflineOwner(uid).catch(() => undefined);
        setProfile(null);
        setIsAdmin(false);
        setIsContentManager(false);
        setIsContentStaff(false);
        setLoading(!!uid);
      }
      if (!uid || (!changed && !refresh)) return;
      const currentGeneration = generation.current;
      if (queuedLoads.has(currentGeneration)) return;
      queuedLoads.add(currentGeneration);
      // Keep Supabase calls outside the synchronous auth callback/lock.
      const timer = setTimeout(() => {
        timers.delete(timer);
        queuedLoads.delete(currentGeneration);
        if (mounted && generation.current === currentGeneration) {
          void loadProfile(uid).catch(console.error);
        }
      }, 0);
      timers.add(timer);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      receivedAuthEvent = true;
      acceptSession(sess, event === "SIGNED_IN" || event === "USER_UPDATED");
    });

    // INITIAL_SESSION normally handles bootstrap. The snapshot is a fallback;
    // it must never duplicate it or overwrite a more recent sign-out/sign-in.
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!receivedAuthEvent) acceptSession(data.session);
      })
      .catch(() => {
        if (!receivedAuthEvent) acceptSession(null);
      });

    return () => {
      mounted = false;
      owner.current = null;
      generation.current += 1;
      inFlight.current = null;
      timers.forEach(clearTimeout);
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    await setActiveOfflineOwner(null).catch(() => undefined);
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
