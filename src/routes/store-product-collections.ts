import type { Request, Response } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db/mongodb.js";
import {
  sanitizeCollectionImage,
  type CollectionDoc,
} from "../utils/cloudinary-validate.js";

const COLLECTION = "product_collection";

export async function listStoreProductCollections(
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
    rawItems.map((r) => sanitizeCollectionImage(db, r as CollectionDoc))
  );
  res.json(
    items.map((r) => ({
      id: r._id.toString(),
      name: r.name,
      slug: r.slug,
      description: r.description ?? "",
      image: r.image ?? null,
      productIds: r.productIds ?? [],
      productCount: (r.productIds ?? []).length,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }))
  );
}

export async function getStoreProductCollectionBySlug(
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
    res.status(404).json({ error: "Collection not found" });
    return;
  }

  const item = await sanitizeCollectionImage(db, rawItem as CollectionDoc);

  res.json({
    id: item._id.toString(),
    name: item.name,
    slug: item.slug,
    description: item.description ?? "",
    image: item.image ?? null,
    productIds: item.productIds ?? [],
    productCount: (item.productIds ?? []).length,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  });
}
