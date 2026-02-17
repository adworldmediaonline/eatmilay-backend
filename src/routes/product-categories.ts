import type { Response } from "express";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getDb } from "../db/mongodb.js";
import type { AuthenticatedRequest } from "../middleware/require-session.js";
import { slugify } from "../utils/slugify.js";
import {
  sanitizeCategoryImage,
  type CategoryDoc,
} from "../utils/cloudinary-validate.js";

const COLLECTION = "product_category";

const imageSchema = z.object({
  url: z.string().url(),
  publicId: z.string(),
  filename: z.string().optional(),
  title: z.string().optional(),
  alt: z.string().optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-_]+$/).optional(),
  description: z.string().max(500).optional(),
  image: imageSchema.nullable().optional(),
});

const updateSchema = createSchema.partial();

export async function listProductCategories(
  req: AuthenticatedRequest,
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
  res.json(
    items.map((r) => ({
      id: r._id.toString(),
      name: r.name,
      slug: r.slug,
      description: r.description ?? "",
      image: r.image ?? null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }))
  );
}

export async function createProductCategory(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }

  const db = getDb();
  const slug = parsed.data.slug ?? slugify(parsed.data.name);

  const existing = await db.collection(COLLECTION).findOne({ slug });
  if (existing) {
    res.status(409).json({ error: "Category with this slug already exists" });
    return;
  }

  const doc = {
    name: parsed.data.name,
    slug,
    description: parsed.data.description ?? "",
    image: parsed.data.image ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await db.collection(COLLECTION).insertOne(doc);
  res.status(201).json({
    id: result.insertedId.toString(),
    ...doc,
  });
}

export async function getProductCategory(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const id = req.params.id;
  if (!id || !ObjectId.isValid(id)) {
    res.status(400).json({ error: "Invalid category ID" });
    return;
  }

  const db = getDb();
  const rawItem = await db.collection(COLLECTION).findOne({
    _id: new ObjectId(id),
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

export async function updateProductCategory(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const id = req.params.id;
  if (!id || !ObjectId.isValid(id)) {
    res.status(400).json({ error: "Invalid category ID" });
    return;
  }

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }

  const db = getDb();
  const update: Record<string, unknown> = {
    ...parsed.data,
    updatedAt: new Date(),
  };

  if (parsed.data.slug) {
    const existing = await db.collection(COLLECTION).findOne({
      slug: parsed.data.slug,
      _id: { $ne: new ObjectId(id) },
    });
    if (existing) {
      res.status(409).json({ error: "Category with this slug already exists" });
      return;
    }
  }

  if (parsed.data.name && !parsed.data.slug) {
    update.slug = slugify(parsed.data.name);
  }

  const result = await db.collection(COLLECTION).findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: update },
    { returnDocument: "after" }
  );

  if (!result) {
    res.status(404).json({ error: "Category not found" });
    return;
  }

  res.json({
    id: result._id.toString(),
    name: result.name,
    slug: result.slug,
    description: result.description ?? "",
    image: result.image ?? null,
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
  });
}

export async function deleteProductCategory(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const id = req.params.id;
  if (!id || !ObjectId.isValid(id)) {
    res.status(400).json({ error: "Invalid category ID" });
    return;
  }

  const db = getDb();
  const categoryObjectId = new ObjectId(id);

  const category = await db.collection(COLLECTION).findOne({
    _id: categoryObjectId,
  });
  if (!category) {
    res.status(404).json({ error: "Category not found" });
    return;
  }

  // Unset categoryId on all products in this category (products become uncategorized)
  await db.collection("product").updateMany(
    { categoryId: id },
    { $set: { categoryId: null, updatedAt: new Date() } }
  );

  const result = await db.collection(COLLECTION).deleteOne({
    _id: categoryObjectId,
  });

  if (result.deletedCount === 0) {
    res.status(404).json({ error: "Category not found" });
    return;
  }

  res.status(204).send();
}
