import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { admin as adminPlugin, anonymous } from "better-auth/plugins";
import { emailOTP } from "better-auth/plugins";
import { getDb, getMongoClient } from "../db/mongodb.js";
import { env } from "../config/env.js";
import { sendVerificationOTP } from "./email.js";
import { roles } from "./permissions.js";
import { firstUserSuperAdmin } from "./first-user-super-admin.js";

const client = getMongoClient();

function mergeCartItems(
  anonItems: Array<{ productId: string; variantIndex?: number; quantity: number; unitPrice: number; lineTotal: number; productName?: string; productSlug?: string }>,
  existingItems: Array<{ productId: string; variantIndex?: number; quantity: number; unitPrice: number; lineTotal: number; productName?: string; productSlug?: string }>
): typeof anonItems {
  const byKey = new Map<string, (typeof anonItems)[0]>();
  for (const item of existingItems) {
    const key = `${item.productId}:${item.variantIndex ?? -1}`;
    byKey.set(key, { ...item });
  }
  for (const item of anonItems) {
    const key = `${item.productId}:${item.variantIndex ?? -1}`;
    const existing = byKey.get(key);
    if (existing) {
      const qty = existing.quantity + item.quantity;
      byKey.set(key, {
        ...existing,
        quantity: qty,
        lineTotal: existing.unitPrice * qty,
      });
    } else {
      byKey.set(key, { ...item });
    }
  }
  return Array.from(byKey.values());
}

const isProduction = env.NODE_ENV === "production";

const trustedOrigins = [
  env.FRONTEND_URL,
  ...(env.FRONTEND_USER_URL ? [env.FRONTEND_USER_URL] : []),
  ...(env.TRUSTED_ORIGINS
    ? env.TRUSTED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
    : []),
];

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins,

  advanced: {
    useSecureCookies: isProduction,
    defaultCookieAttributes: isProduction
      ? { sameSite: "none", secure: true }
      : undefined,
    crossSubDomainCookies:
      isProduction && env.COOKIE_DOMAIN && !env.USE_AUTH_PROXY
        ? { enabled: true, domain: env.COOKIE_DOMAIN }
        : undefined,
  },

  database: mongodbAdapter(getDb(), { client }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },

  emailVerification: {
    autoSignInAfterVerification: true,
  },

  plugins: [
    anonymous({
      emailDomainName: "eatmilay.com",
      onLinkAccount: async ({ anonymousUser, newUser }) => {
        const db = getDb();
        const anonId = (anonymousUser as { user?: { id: string }; id?: string }).user?.id ?? (anonymousUser as { id?: string }).id;
        const newId = (newUser as { user?: { id: string }; id?: string }).user?.id ?? (newUser as { id?: string }).id;
        if (!anonId || !newId) return;
        const anonCart = await db.collection("cart").findOne({
          customerId: anonId,
        });
        if (anonCart?.items?.length) {
          const existingCart = await db.collection("cart").findOne({
            customerId: newId,
          });
          const mergedItems = mergeCartItems(
            anonCart.items ?? [],
            existingCart?.items ?? []
          );
          const subtotal = mergedItems.reduce(
            (s: number, i: { lineTotal: number }) => s + (i.lineTotal ?? 0),
            0
          );
          await db.collection("cart").deleteOne({
            customerId: anonId,
          });
          const now = new Date();
          const reminderEmail =
            (typeof anonCart.reminderEmail === "string" && anonCart.reminderEmail.trim())
              ? anonCart.reminderEmail.trim().toLowerCase()
              : existingCart?.reminderEmail ?? null;
          await db.collection("cart").updateOne(
            { customerId: newId },
            {
              $set: {
                items: mergedItems,
                subtotal,
                couponCode: anonCart.couponCode ?? existingCart?.couponCode ?? null,
                discountAmount: anonCart.discountAmount ?? existingCart?.discountAmount ?? 0,
                reminderEmail,
                lastUpdated: now,
                updatedAt: now,
              },
            },
            { upsert: true }
          );
        }
      },
    }),
    emailOTP({
      overrideDefaultEmailVerification: true,
      sendVerificationOnSignUp: true,
      async sendVerificationOTP({ email, otp, type }) {
        void sendVerificationOTP({ email, otp, type });
      },
    }),
    adminPlugin({
      roles,
      defaultRole: "user",
      adminRoles: ["admin", "super_admin"],
    }),
    firstUserSuperAdmin(),
  ],

  rateLimit: {
    enabled: true,
    storage: "memory",
    customRules: {
      "/api/auth/sign-in/email": { window: 60, max: 5 },
      "/api/auth/sign-up/email": { window: 60, max: 3 },
      "/api/auth/email-otp/send-verification-otp": { window: 60, max: 3 },
    },
  },
});
