export function useAuth() {
  return {
    isAdmin: false,
    isContentStaff: false,
    signOut: async () => {},
    user: { id: "fixture" },
  };
}
export function OfflineSyncBridge() {
  return null;
}
