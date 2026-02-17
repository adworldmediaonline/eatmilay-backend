/**
 * Available permissions aligned with Better Auth admin plugin.
 * Super Admin can create custom roles by selecting a subset of these.
 */
export const PERMISSION_RESOURCES = {
  user: [
    "create",
    "list",
    "set-role",
    "ban",
    "impersonate",
    "delete",
    "set-password",
    "get",
    "update",
  ] as const,
  session: ["list", "revoke", "delete"] as const,
} as const;

export type UserPermission = (typeof PERMISSION_RESOURCES.user)[number];
export type SessionPermission = (typeof PERMISSION_RESOURCES.session)[number];

export type RolePermissions = {
  user: UserPermission[];
  session: SessionPermission[];
};

export const SYSTEM_ROLES = ["super_admin", "admin", "user"] as const;

export type SystemRole = (typeof SYSTEM_ROLES)[number];

export function isSystemRole(role: string): role is SystemRole {
  return SYSTEM_ROLES.includes(role as SystemRole);
}
