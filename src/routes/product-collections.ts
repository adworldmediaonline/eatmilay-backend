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

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const COLLECTION_SORT_FIELDS = ["name", "slug", "createdAt", "updatedAt"] as const;
const SORT_ORDERS = ["asc", "desc"] as const;

export async function listProductCollections(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const db = getDb();
  const search = (req.query.search as string | undefined)?.trim();
  const sortByRaw = req.query.sortBy as string | undefined;
  const sortOrderRaw = req.query.sortOrder as string | undefined;
  const limitRaw = req.query.limit as string | undefined;
  const offsetRaw = req.query.offset as string | undefined;

  const sortBy: (typeof COLLECTION_SORT_FIELDS)[number] = COLLECTION_SORT_FIELDS.includes(
    sortByRaw as (typeof COLLECTION_SORT_FIELDS)[number]
  )
    ? (sortByRaw as (typeof COLLECTION_SORT_FIELDS)[number])
    : "createdAt";
  const sortOrder: (typeof SORT_ORDERS)[number] = SORT_ORDERS.includes(
    sortOrderRaw as (typeof SORT_ORDERS)[number]
  )
    ? (sortOrderRaw as (typeof SORT_ORDERS)[number])
    : "desc";
  const limit = Math.min(
    Math.max(1, parseInt(limitRaw ?? "20", 10) || 20),
    100
  );
  const offset = Math.max(0, parseInt(offsetRaw ?? "0", 10) || 0);

  const filter: Record<string, unknown> = {};
  if (search && search.length > 0) {
    const pattern = escapeRegex(search);
    const regex = { $regex: pattern, $options: "i" };
    filter.$or = [{ name: regex }, { slug: regex }];
  }

  const sortDir = sortOrder === "asc" ? 1 : -1;
  const sortObj: Record<string, 1 | -1> = { [sortBy]: sortDir };

  const [total, rawItems] = await Promise.all([
    db.collection(COLLECTION).countDocuments(filter),
    db
      .collection(COLLECTION)
      .find(filter)
      .sort(sortObj)
      .skip(offset)
      .limit(limit)
      .toArray(),
  ]);

  const items = rawItems as CollectionDoc[];

  res.json({
    items: items.map((r) => ({
      id: r._id.toString(),
      name: r.name,
      slug: r.slug,
      description: r.description ?? "",
      image: r.image ?? null,
      productIds: r.productIds ?? [],
      productCount: (r.productIds ?? []).length,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
    total,
  });
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
