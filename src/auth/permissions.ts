import { defaultRoles, adminAc } from "better-auth/plugins/admin/access";

export const roles = {
  ...defaultRoles,
  super_admin: adminAc,
} as const;

export type AdminRole = keyof typeof roles;
