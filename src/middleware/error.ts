import type { Request, Response, NextFunction } from "express";

type AuthError = Error & { status?: number };

export function errorHandler(
  err: AuthError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const status = err.status ?? 500;
  const message = err.message ?? "Internal server error";
  res.status(status).json({ error: message });
}
