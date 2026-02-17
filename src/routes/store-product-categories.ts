import type { Request, Response } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db/mongodb.js";
import {
  sanitizeCategoryImage,
  type CategoryDoc,
} from "../utils/cloudinary-validate.js";

const COLLECTION = "product_category";

export async function listStoreProductCategories(
  req: Request,
  res: Response
): Promise<void> {
  const db = getDb();
  const rawItems = await db
    .collection(COLLECTION)
    .find({})
    .sort({ createdAt: -1 })
    .toArray();
  const items = await Promise.all(
    rawItems.map((r) => sanitizeCategoryImage(db, r as CategoryDoc))
  );
  const categoryIds = items.map((r) => r._id.toString());
  const productCounts =
    categoryIds.length > 0
      ? await db
          .collection("product")
          .aggregate<{ _id: string; count: number }>([
            { $match: { categoryId: { $in: categoryIds } } },
            { $group: { _id: "$categoryId", count: { $sum: 1 } } },
          ])
          .toArray()
      : [];
  const countMap = Object.fromEntries(
    productCounts.map((c) => [c._id, c.count])
  );
  res.json(
    items.map((r) => ({
      id: r._id.toString(),
      name: r.name,
      slug: r.slug,
      description: r.description ?? "",
      image: r.image ?? null,
      productCount: countMap[r._id.toString()] ?? 0,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }))
  );
}

export async function getStoreProductCategoryBySlug(
  req: Request,
  res: Response
): Promise<void> {
  const slug = req.params.slug;
  if (!slug?.trim()) {
    res.status(400).json({ error: "Slug is required" });
    return;
  }

  const db = getDb();
  const rawItem = await db.collection(COLLECTION).findOne({
    slug: slug.trim(),
  });
  if (!rawItem) {
    res.status(404).json({ error: "Category not found" });
    return;
  }

  const item = await sanitizeCategoryImage(db, rawItem as CategoryDoc);

  res.json({
    id: item._id.toString(),
    name: item.name,
    slug: item.slug,
    description: item.description ?? "",
    image: item.image ?? null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  });
}
