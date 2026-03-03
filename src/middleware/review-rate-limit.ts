import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import type { AuthenticatedRequest } from "./require-session.js";

/**
 * Rate limit for review submission: 5 per hour per user.
 * Must be used after requireSession so req.session is set.
 */
export const reviewSubmitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: "Too many review submissions. Try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = (req as AuthenticatedRequest).session?.user?.id;
    if (userId) return userId;
    return ipKeyGenerator(req.ip ?? "0.0.0.0");
  },
});
