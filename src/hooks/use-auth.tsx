import { isStudentProfileComplete } from "@/lib/profile-completion";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { isAuthRetryableFetchError, type Session, type User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { deriveAuthRoles } from "@/lib/auth-roles";
import { getNetworkState } from "@/lib/offline/network";
import { useConnectivity } from "@/hooks/use-connectivity";
import {
  readStudentIdentity,
  rememberStudentIdentity,
  forgetStudentIdentity,
} from "@/lib/offline/student-shell-cache";
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
  refreshProfile: () => Promise<Profile | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const online = useConnectivity();
  const [offlineUser, setOfflineUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isContentManager, setIsContentManager] = useState(false);
  const [isContentStaff, setIsContentStaff] = useState(false);
  const owner = useRef<string | null>(null);
  const generation = useRef(0);
  const inFlight = useRef<{ generation: number; promise: Promise<Profile | null> } | null>(null);
  const wasOffline = useRef(false);
  const rememberedIdentity = useRef<Awaited<ReturnType<typeof readStudentIdentity>>>(null);
  const explicitSignOut = useRef(false);

  const loadProfile = useCallback((userId: string, force = false): Promise<Profile | null> => {
    if (owner.current !== userId) return Promise.resolve(null);
    // An explicit refresh after editing a profile must supersede older reads.
    if (force) generation.current += 1;
    const currentGeneration = generation.current;
    if (inFlight.current?.generation === currentGeneration) return inFlight.current.promise;

    // Independent requests share one network round trip. Concurrent auth
    // notifications reuse this promise, never a previous account's result.
    const promise = (async () => {
      if (!(await getNetworkState()).online) {
        const saved = await readStudentIdentity();
        if (
          generation.current === currentGeneration &&
          owner.current === userId &&
          saved?.user.id === userId
        ) {
          setProfile(saved.profile);
          setOfflineUser(saved.user);
          setIsAdmin(false);
          setIsContentManager(false);
          setIsContentStaff(false);
          return saved.profile;
        }
        return null;
      }
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
      if (generation.current !== currentGeneration || owner.current !== userId) return null;
      const loadedProfile = profileResult.error
        ? null
        : ((profileResult.data as Profile | null) ?? null);
      setProfile(loadedProfile);
      setOfflineUser(null);
      if (loadedProfile) {
        // Persist the owner before the identity cache. This removes the race
        // where a fast profile response arrived before activeOwnerId was saved.
        await setActiveOfflineOwner(userId).catch(() => undefined);
        await rememberStudentIdentity(loadedProfile).catch(() => undefined);
        rememberedIdentity.current = {
          profile: loadedProfile,
          user: {
            id: loadedProfile.user_id,
            aud: "authenticated",
            app_metadata: {},
            user_metadata: {},
            created_at: "",
          } as User,
        };
      }
      const roles = deriveAuthRoles({
        hasAdmin: !adminResult.error && adminResult.data === true,
        hasContentManager: !managerResult.error && managerResult.data === true,
      });
      setIsAdmin(roles.isAdmin);
      setIsContentManager(roles.isContentManager);
      setIsContentStaff(roles.isContentStaff);
      if (force && profileResult.error) throw profileResult.error;
      return profileResult.error ? null : ((profileResult.data as Profile | null) ?? null);
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
    return uid ? await loadProfile(uid, true) : null;
  }, [session?.user?.id, loadProfile]);

  useEffect(() => {
    let mounted = true;
    let receivedAuthEvent = false;
    let initialized = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const queuedLoads = new Set<number>();

    const acceptSession = (sess: Session | null, refresh = false) => {
      if (!mounted) return;

      if (!sess && !explicitSignOut.current) {
        const saved = rememberedIdentity.current;
        setSession(null);
        setIsAdmin(false);
        setIsContentManager(false);
        setIsContentStaff(false);
        if (saved) {
          initialized = true;
          owner.current = saved.user.id;
          setOfflineUser(saved.user);
          setProfile(saved.profile);
          setLoading(false);
          void setActiveOfflineOwner(saved.user.id).catch(() => undefined);
          return;
        }
        // A missing SDK session is not by itself proof that the student chose
        // to sign out. The durable identity bootstrap may still be resolving.
        setLoading(false);
        return;
      }

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
        setOfflineUser(null);
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

    // Restore the durable student identity on every cold start, online or offline.
    // This is the long-lived local lease that keeps the student inside the app
    // while Supabase silently restores/refreshes the network session in parallel.
    const bootstrapGeneration = generation.current;
    void (async () => {
      const saved = await readStudentIdentity();
      if (!mounted || !saved || explicitSignOut.current) {
        if (mounted && !initialized) setLoading(false);
        return;
      }
      rememberedIdentity.current = saved;
      if (generation.current !== bootstrapGeneration && owner.current !== saved.user.id) return;
      owner.current = saved.user.id;
      initialized = true;
      setOfflineUser(saved.user);
      setProfile(saved.profile);
      setLoading(false);
      setIsAdmin(false);
      setIsContentManager(false);
      setIsContentStaff(false);
      void setActiveOfflineOwner(saved.user.id).catch(() => undefined);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      // Revoke the academy's offline entry when the shared account changes or signs out.
      try {
        const owner = localStorage.getItem("tamkeen-academy-offline-owner");
        if (event === "SIGNED_OUT" || (sess && owner && owner !== sess.user.id)) {
          localStorage.removeItem("tamkeen-academy-offline-owner");
          window.dispatchEvent(new Event("academy-offline-change"));
        }
      } catch {
        /* Storage may be unavailable. */
      }
      if (event === "SIGNED_OUT" && explicitSignOut.current) {
        setIsAdmin(false);
        setIsContentManager(false);
        setIsContentStaff(false);
        generation.current += 1;
        owner.current = null;
        rememberedIdentity.current = null;
        setOfflineUser(null);
        setProfile(null);
        setSession(null);
        setLoading(false);
        void forgetStudentIdentity();
        void setActiveOfflineOwner(null).catch(() => undefined);
      }
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

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      setIsAdmin(false);
      setIsContentManager(false);
      setIsContentStaff(false);
      return;
    }
    // Revalidate roles after every reconnect, including sessions that were already
    // online when the connection dropped. Offline-only identities use the same path.
    if (!wasOffline.current) return;
    wasOffline.current = false;
    const restoringOwner = offlineUser?.id ?? session?.user.id;
    if (!restoringOwner) return;
    const restoringGeneration = generation.current;
    void supabase.auth
      .getUser()
      .then(async ({ data, error }) => {
        if (owner.current !== restoringOwner || generation.current !== restoringGeneration) return;
        if (!error && data.user?.id === restoringOwner) {
          await loadProfile(data.user.id, true);
        } else if (error && !isAuthRetryableFetchError(error)) {
          // Do not turn a server-side refresh failure into a local logout.
          // Keep the durable student lease so the app still opens immediately;
          // authenticated network calls remain protected by Supabase/RLS.
          setSession(null);
          setIsAdmin(false);
          setIsContentManager(false);
          setIsContentStaff(false);
          const saved = rememberedIdentity.current ?? (await readStudentIdentity());
          if (saved && saved.user.id === restoringOwner) {
            rememberedIdentity.current = saved;
            owner.current = saved.user.id;
            setOfflineUser(saved.user);
            setProfile(saved.profile);
            setLoading(false);
            await setActiveOfflineOwner(saved.user.id).catch(() => undefined);
          }
        }
      })
      .catch(() => undefined);
  }, [online, offlineUser, session?.user.id, loadProfile]);

  const signOut = useCallback(async () => {
    explicitSignOut.current = true;
    generation.current += 1;
    owner.current = null;
    rememberedIdentity.current = null;
    setOfflineUser(null);
    setSession(null);
    setProfile(null);
    setIsAdmin(false);
    setIsContentManager(false);
    setIsContentStaff(false);
    await forgetStudentIdentity();
    await setActiveOfflineOwner(null).catch(() => undefined);
    try {
      await supabase.auth.signOut(navigator.onLine ? undefined : { scope: "local" });
    } finally {
      explicitSignOut.current = false;
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        loading,
        session,
        user: session?.user ?? offlineUser,
        profile,
        isAdmin,
        isContentManager,
        isContentStaff,
        profileComplete: isStudentProfileComplete(profile),
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
