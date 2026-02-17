import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { admin as adminPlugin } from "better-auth/plugins";
import { emailOTP } from "better-auth/plugins";
import { env } from "../config/env.js";
import { sendVerificationOTP } from "./email.js";
import { getDb, getMongoClient } from "../db/mongodb.js";
import { roles } from "./permissions.js";
import { firstUserSuperAdmin } from "./first-user-super-admin.js";

const client = getMongoClient();

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
      isProduction && env.COOKIE_DOMAIN
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
