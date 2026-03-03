import type { Request, Response, NextFunction } from "express";

type AuthError = Error & { status?: number };

/**
 * Ensures CORS headers are set on error responses so the browser can read the
 * response instead of blocking it with "CORS header missing".
 */
function setCorsHeadersOnError(req: Request, res: Response, allowedOrigins: string[]): void {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
}

export function createErrorHandler(allowedOrigins: string[]) {
  return function errorHandler(
    err: AuthError,
    req: Request,
    res: Response,
    _next: NextFunction
  ): void {
    setCorsHeadersOnError(req, res, allowedOrigins);
    const status = err.status ?? 500;
    const message = err.message ?? "Internal server error";
    res.status(status).json({ error: message });
  };
}
