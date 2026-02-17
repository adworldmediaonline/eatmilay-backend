import { v2 as cloudinary } from "cloudinary";
import type { Db, ObjectId } from "mongodb";
import { env } from "../config/env.js";

const CLOUDINARY_NOT_CONFIGURED =
  !env.CLOUDINARY_CLOUD_NAME ||
  !env.CLOUDINARY_API_KEY ||
  !env.CLOUDINARY_API_SECRET;

/**
 * Check if a Cloudinary resource exists by public_id.
 * Returns false only when we're confident the resource is gone (404).
 * Returns true when Cloudinary is not configured (skip validation) or on other errors (safe default).
 */
export async function cloudinaryResourceExists(publicId: string): Promise<boolean> {
  if (CLOUDINARY_NOT_CONFIGURED) return true;

  try {
    await cloudinary.api.resource(publicId);
    return true;
  } catch (err: unknown) {
    const error = err as { error?: { http_code?: number } };
    if (error?.error?.http_code === 404) return false;
    return true;
  }
}

/**
 * Remove an orphaned image (deleted from Cloudinary) from all products and categories.
 */
export async function removeOrphanedImage(db: Db, publicId: string): Promise<void> {
  await db.collection("product").updateMany(
    { "images.publicId": publicId },
    { $pull: { images: { publicId } }, $set: { updatedAt: new Date() } } as Record<string, unknown>
  );
  await db.collection("product_category").updateMany(
    { "image.publicId": publicId },
    { $set: { image: null, updatedAt: new Date() } }
  );
  await db.collection("product_collection").updateMany(
    { "image.publicId": publicId },
    { $set: { image: null, updatedAt: new Date() } }
  );
}

export type ProductDoc = {
  _id: ObjectId;
  images?: Array<{ url: string; publicId: string }>;
  categoryId?: string | null;
  shortDescription?: string;
  sku?: string | null;
  tags?: string[];
  metaTitle?: string | null;
  metaDescription?: string | null;
  metaKeywords?: string | null;
  currency?: string;
  vendor?: string | null;
  productType?: "simple" | "variable" | "bundle";
  options?: Array<{ name: string; values: string[] }>;
  variants?: Array<{
    optionValues: string[];
    sku?: string;
    price: number;
    compareAtPrice?: number | null;
    label?: "most_popular" | null;
    volumeTiers?: Array<{
      minQuantity: number;
      maxQuantity?: number | null;
      price: number;
      compareAtPrice?: number | null;
      label?: "most_popular" | "best_seller" | "super_saver" | null;
    }>;
    stockQuantity?: number;
    lowStockThreshold?: number | null;
    allowBackorder?: boolean;
  }>;
  bundleItems?: Array<{ productId: string; quantity: number; priceOverride?: number | null }>;
  bundlePricing?: "fixed" | "sum" | "discounted" | null;
  bundlePrice?: number | null;
  bundleDiscountPercent?: number | null;
  trackInventory?: boolean;
  stockQuantity?: number;
  lowStockThreshold?: number | null;
  allowBackorder?: boolean;
  relatedProductIds?: string[];
  volumeTiers?: Array<{
    minQuantity: number;
    maxQuantity?: number | null;
    price: number;
    compareAtPrice?: number | null;
    label?: "most_popular" | "best_seller" | "super_saver" | null;
  }>;
  [key: string]: unknown;
};

export type CategoryDoc = {
  _id: ObjectId;
  image?: { url: string; publicId: string } | null;
  [key: string]: unknown;
};

export type CollectionDoc = {
  _id: ObjectId;
  name?: string;
  slug?: string;
  description?: string;
  image?: { url: string; publicId: string } | null;
  productIds?: string[];
  createdAt?: Date;
  updatedAt?: Date;
  [key: string]: unknown;
};

/**
 * Validate product images against Cloudinary. Remove any that no longer exist and persist changes.
 */
export async function sanitizeProductImages(
  db: Db,
  product: ProductDoc
): Promise<ProductDoc> {
  const images = product.images ?? [];
  if (images.length === 0) return product;

  const checks = await Promise.all(
    images.map(async (img) => ({
      img,
      exists: await cloudinaryResourceExists(img.publicId),
    }))
  );
  const validImages = checks.filter((c) => c.exists).map((c) => c.img);
  const orphanedPublicIds = checks.filter((c) => !c.exists).map((c) => c.img.publicId);

  if (orphanedPublicIds.length === 0) return product;

  for (const publicId of orphanedPublicIds) {
    await removeOrphanedImage(db, publicId);
  }
  return { ...product, images: validImages };
}

/**
 * Validate category image against Cloudinary. Remove if it no longer exists and persist change.
 */
export async function sanitizeCategoryImage(
  db: Db,
  category: CategoryDoc
): Promise<CategoryDoc> {
  const image = category.image;
  if (!image?.publicId) return category;

  const exists = await cloudinaryResourceExists(image.publicId);
  if (exists) return category;

  await removeOrphanedImage(db, image.publicId);
  return { ...category, image: null };
}

/**
 * Validate collection image against Cloudinary. Remove if it no longer exists and persist change.
 */
export async function sanitizeCollectionImage(
  db: Db,
  collection: CollectionDoc
): Promise<CollectionDoc> {
  const image = collection.image;
  if (!image?.publicId) return collection;

  const exists = await cloudinaryResourceExists(image.publicId);
  if (exists) return collection;

  await removeOrphanedImage(db, image.publicId);
  return { ...collection, image: null };
}
