import type { Response } from "express";
import { v2 as cloudinary } from "cloudinary";
import { env } from "../config/env.js";
import type { AuthenticatedRequest } from "../middleware/require-session.js";

export function configureCloudinary(): void {
  if (env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET) {
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
    });
  }
}

export async function getUploadSignature(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (
    !env.CLOUDINARY_CLOUD_NAME ||
    !env.CLOUDINARY_API_KEY ||
    !env.CLOUDINARY_API_SECRET
  ) {
    res.status(503).json({
      error: "Cloudinary is not configured. Set CLOUDINARY_* env vars.",
    });
    return;
  }

  const folder = (req.query.folder as string) || "admin";
  const timestamp = Math.round(Date.now() / 1000);
  const eager = "f_webp/q_auto";
  const use_filename = "true";
  const unique_filename = "true";

  try {
    const signature = cloudinary.utils.api_sign_request(
      {
        eager,
        folder,
        timestamp,
        unique_filename,
        use_filename,
      },
      env.CLOUDINARY_API_SECRET!
    );

    res.json({
      signature,
      timestamp,
      cloudName: env.CLOUDINARY_CLOUD_NAME,
      apiKey: env.CLOUDINARY_API_KEY,
      eager,
      use_filename,
      unique_filename,
    });
  } catch (err) {
    console.error("Cloudinary signature error:", err);
    res.status(500).json({ error: "Failed to generate upload signature" });
  }
}

export async function deleteImage(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (
    !env.CLOUDINARY_CLOUD_NAME ||
    !env.CLOUDINARY_API_KEY ||
    !env.CLOUDINARY_API_SECRET
  ) {
    res.status(503).json({
      error: "Cloudinary is not configured. Set CLOUDINARY_* env vars.",
    });
    return;
  }

  const publicId = req.body?.publicId as string | undefined;
  if (!publicId || typeof publicId !== "string" || !publicId.trim()) {
    res.status(400).json({ error: "publicId is required" });
    return;
  }

  try {
    const result = await cloudinary.uploader.destroy(publicId.trim());
    if (result.result === "not found") {
      res.status(404).json({ error: "Image not found in Cloudinary" });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Cloudinary delete error:", err);
    res.status(500).json({ error: "Failed to delete image" });
  }
}
