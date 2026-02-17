import type { BetterAuthPlugin } from "better-auth";
import { getDb } from "../db/mongodb.js";

const db = getDb();

type UserCreateInput = Record<string, unknown>;

/**
 * Plugin that assigns super_admin role to the first user created.
 * Must be registered after the admin plugin so this hook runs after the admin's create.before.
 */
export const firstUserSuperAdmin = (): BetterAuthPlugin => ({
  id: "first-user-super-admin",
  init() {
    return {
      options: {
        databaseHooks: {
          user: {
            create: {
              before: async (user: UserCreateInput) => {
                const userCount = await db.collection("user").countDocuments();
                if (userCount === 0) {
                  return { data: { ...user, role: "super_admin" } };
                }
              },
            },
          },
        },
      },
    };
  },
});
