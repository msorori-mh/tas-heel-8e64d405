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
import { type Session, type User } from "@supabase/supabase-js";
import { isTerminalSessionError } from "@/lib/auth/session-errors";
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

export function AuthProvider({
  children,
  onAccountChange,
}: {
  children: ReactNode;
  onAccountChange?: () => void;
}) {
  const accountChange = useRef(onAccountChange);
  accountChange.current = onAccountChange;
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
  const activeOwnerWrite = useRef<Promise<void>>(Promise.resolve());
  const restoredFromDurableLease = useRef(false);
  const identityRejected = useRef(false);
  const onlineRef = useRef(online);
  onlineRef.current = online;

  const revokeIdentity = useCallback(async () => {
    identityRejected.current = true;
    accountChange.current?.();
    const revokedGeneration = ++generation.current;
    owner.current = null;
    inFlight.current = null;
    rememberedIdentity.current = null;
    restoredFromDurableLease.current = false;
    setOfflineUser(null);
    setSession(null);
    setProfile(null);
    setIsAdmin(false);
    setIsContentManager(false);
    setIsContentStaff(false);
    setLoading(false);
    const cleanup = activeOwnerWrite.current.then(async () => {
      await forgetStudentIdentity();
      if (generation.current === revokedGeneration && owner.current === null) {
        await setActiveOfflineOwner(null);
      }
    });
    activeOwnerWrite.current = cleanup.catch(() => undefined);
    await activeOwnerWrite.current;
  }, []);

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
        await rememberStudentIdentity(loadedProfile).catch(() => undefined);
        if (generation.current !== currentGeneration || owner.current !== userId) return null;
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
    let identityBootstrapResolved = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const queuedLoads = new Set<number>();

    const acceptSession = (sess: Session | null, refresh = false) => {
      if (!mounted) return;

      if (sess) identityRejected.current = false;
      if (!sess && !explicitSignOut.current && !identityRejected.current) {
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
        // to sign out. Keep the gate loading until the durable identity read
        // resolves so the login screen never flashes on a remembered account.
        if (identityBootstrapResolved) {
          generation.current += 1;
          owner.current = null;
          inFlight.current = null;
          setOfflineUser(null);
          setProfile(null);
          setLoading(false);
          activeOwnerWrite.current = setActiveOfflineOwner(null).catch(() => undefined);
        }
        return;
      }

      const uid = sess?.user?.id ?? null;
      const changed = !initialized || owner.current !== uid;
      initialized = true;
      setSession(sess);
      if (changed) {
        if (owner.current !== uid) accountChange.current?.();
        owner.current = uid;
        generation.current += 1;
        inFlight.current = null;
        activeOwnerWrite.current = activeOwnerWrite.current
          .then(() => setActiveOfflineOwner(uid))
          .catch(() => undefined);
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
          void activeOwnerWrite.current.then(() => loadProfile(uid)).catch(console.error);
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
      identityBootstrapResolved = true;
      if (!mounted || !saved || explicitSignOut.current || identityRejected.current) {
        if (mounted && !initialized) setLoading(false);
        return;
      }
      if (generation.current !== bootstrapGeneration && owner.current !== saved.user.id) return;
      rememberedIdentity.current = saved;
      restoredFromDurableLease.current = true;
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
      if (event === "SIGNED_OUT" && (explicitSignOut.current || onlineRef.current)) {
        receivedAuthEvent = true;
        void revokeIdentity();
        return;
      }
      receivedAuthEvent = true;
      const shouldRefreshRestoredLease =
        event === "INITIAL_SESSION" && restoredFromDurableLease.current;
      if (shouldRefreshRestoredLease) restoredFromDurableLease.current = false;
      acceptSession(
        sess,
        shouldRefreshRestoredLease || event === "SIGNED_IN" || event === "USER_UPDATED",
      );
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
  }, [loadProfile, revokeIdentity]);

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
    if (!wasOffline.current && !(offlineUser && !session)) return;
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
        } else if (isTerminalSessionError(error) || (!error && !data.user)) {
          await revokeIdentity();
          // Outside the auth callback/lock. Never invalidate a newer account.
          if (!owner.current) await supabase.auth.signOut({ scope: "local" });
        }
      })
      .catch(() => undefined);
  }, [online, offlineUser, session, loadProfile, revokeIdentity]);

  const signOut = useCallback(async () => {
    explicitSignOut.current = true;
    try {
      await revokeIdentity();
      if (!owner.current)
        await supabase.auth.signOut(navigator.onLine ? undefined : { scope: "local" });
    } finally {
      explicitSignOut.current = false;
    }
  }, [revokeIdentity]);

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
