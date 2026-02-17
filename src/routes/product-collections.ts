import type { Response } from "express";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getDb } from "../db/mongodb.js";
import type { AuthenticatedRequest } from "../middleware/require-session.js";
import { slugify } from "../utils/slugify.js";
import {
  sanitizeCollectionImage,
  type CollectionDoc,
} from "../utils/cloudinary-validate.js";

const COLLECTION = "product_collection";

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
  productIds: z.array(z.string()).optional(),
});

const updateSchema = createSchema.partial();

export async function listProductCollections(
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

export async function createProductCollection(
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
    res.status(409).json({ error: "Collection with this slug already exists" });
    return;
  }

  const productIds = (parsed.data.productIds ?? []).filter((id) =>
    ObjectId.isValid(id)
  );

  const doc = {
    name: parsed.data.name,
    slug,
    description: parsed.data.description ?? "",
    image: parsed.data.image ?? null,
    productIds,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await db.collection(COLLECTION).insertOne(doc);
  res.status(201).json({
    id: result.insertedId.toString(),
    ...doc,
  });
}

export async function getProductCollection(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const id = req.params.id;
  if (!id || !ObjectId.isValid(id)) {
    res.status(400).json({ error: "Invalid collection ID" });
    return;
  }

  const db = getDb();
  const rawItem = await db.collection(COLLECTION).findOne({
    _id: new ObjectId(id),
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
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  });
}

export async function updateProductCollection(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const id = req.params.id;
  if (!id || !ObjectId.isValid(id)) {
    res.status(400).json({ error: "Invalid collection ID" });
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
      res.status(409).json({ error: "Collection with this slug already exists" });
      return;
    }
  }

  if (parsed.data.name && !parsed.data.slug) {
    update.slug = slugify(parsed.data.name);
  }

  if ("productIds" in parsed.data) {
    update.productIds = (parsed.data.productIds ?? []).filter((pid) =>
      ObjectId.isValid(pid)
    );
  }

  const result = await db.collection(COLLECTION).findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: update },
    { returnDocument: "after" }
  );

  if (!result) {
    res.status(404).json({ error: "Collection not found" });
    return;
  }

  res.json({
    id: result._id.toString(),
    name: result.name,
    slug: result.slug,
    description: result.description ?? "",
    image: result.image ?? null,
    productIds: result.productIds ?? [],
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
  });
}

export async function deleteProductCollection(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const id = req.params.id;
  if (!id || !ObjectId.isValid(id)) {
    res.status(400).json({ error: "Invalid collection ID" });
    return;
  }

  const db = getDb();
  const result = await db.collection(COLLECTION).deleteOne({
    _id: new ObjectId(id),
  });

  if (result.deletedCount === 0) {
    res.status(404).json({ error: "Collection not found" });
    return;
  }

  res.status(204).send();
}
