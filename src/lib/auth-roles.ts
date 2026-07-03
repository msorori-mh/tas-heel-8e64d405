/** Role flags derived from has_role RPC checks. */

export type RoleFlags = {
  hasAdmin: boolean;
  hasContentManager: boolean;
};

export type AuthRoleState = {
  isAdmin: boolean;
  isContentManager: boolean;
  isContentStaff: boolean;
};

/** isAdmin = admin only; isContentManager = content_manager only; isContentStaff = admin OR content_manager */
export function deriveAuthRoles(flags: RoleFlags): AuthRoleState {
  const isAdmin = Boolean(flags.hasAdmin);
  const isContentManager = Boolean(flags.hasContentManager);
  return {
    isAdmin,
    isContentManager,
    isContentStaff: isAdmin || isContentManager,
  };
}
