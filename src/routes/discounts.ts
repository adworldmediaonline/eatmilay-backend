import type { Response } from "express";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getDb } from "../db/mongodb.js";
import type { AuthenticatedRequest } from "../middleware/require-session.js";

const COLLECTION = "discount";

const createSchema = z.object({
  code: z.string().min(1).max(50),
  type: z.enum(["percentage", "fixed"]),
  value: z.number().min(0),
  productIds: z.array(z.string()).optional(),
  minOrderAmount: z.number().min(0).optional().nullable(),
  maxUsage: z.number().int().min(0).optional().nullable(),
  expiresAt: z.union([z.string(), z.date()]).optional().nullable(),
  status: z.enum(["active", "disabled"]).default("active"),
});

const updateSchema = createSchema.partial();

export async function listDiscounts(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const db = getDb();
  const items = await db
    .collection(COLLECTION)
    .find({})
    .sort({ createdAt: -1 })
    .toArray();

  res.json(
    items.map((r) => ({
      id: r._id.toString(),
      code: r.code,
      type: r.type,
      value: r.value,
      productIds: r.productIds ?? [],
      minOrderAmount: r.minOrderAmount ?? null,
      maxUsage: r.maxUsage ?? null,
      usedCount: r.usedCount ?? 0,
      expiresAt: r.expiresAt ?? null,
      status: r.status ?? "active",
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }))
  );
}

export async function getDiscount(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const id = req.params.id;
  if (!id || !ObjectId.isValid(id)) {
    res.status(400).json({ error: "Invalid discount ID" });
    return;
  }

  const db = getDb();
  const item = await db.collection(COLLECTION).findOne({
    _id: new ObjectId(id),
  });

  if (!item) {
    res.status(404).json({ error: "Discount not found" });
    return;
  }

  res.json({
    id: item._id.toString(),
    code: item.code,
    type: item.type,
    value: item.value,
    productIds: item.productIds ?? [],
    minOrderAmount: item.minOrderAmount ?? null,
    maxUsage: item.maxUsage ?? null,
    usedCount: item.usedCount ?? 0,
    expiresAt: item.expiresAt ?? null,
    status: item.status ?? "active",
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  });
}

export async function createDiscount(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }

  const db = getDb();
  const code = parsed.data.code.trim().toUpperCase();

  const existing = await db.collection(COLLECTION).findOne({
    code: { $regex: new RegExp(`^${code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
  });
  if (existing) {
    res.status(409).json({ error: "A discount with this code already exists" });
    return;
  }

  const productIds = (parsed.data.productIds ?? []).filter((id) =>
    ObjectId.isValid(id)
  );
  const expiresAt = parsed.data.expiresAt
    ? new Date(parsed.data.expiresAt)
    : null;

  const doc = {
    code,
    type: parsed.data.type,
    value: parsed.data.value,
    productIds,
    minOrderAmount: parsed.data.minOrderAmount ?? null,
    maxUsage: parsed.data.maxUsage ?? null,
    usedCount: 0,
    expiresAt,
    status: parsed.data.status ?? "active",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await db.collection(COLLECTION).insertOne(doc);
  res.status(201).json({
    id: result.insertedId.toString(),
    ...doc,
    expiresAt: doc.expiresAt?.toISOString() ?? null,
  });
}

export async function updateDiscount(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const id = req.params.id;
  if (!id || !ObjectId.isValid(id)) {
    res.status(400).json({ error: "Invalid discount ID" });
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

  if (parsed.data.code) {
    const code = parsed.data.code.trim().toUpperCase();
    const existing = await db.collection(COLLECTION).findOne({
      code: { $regex: new RegExp(`^${code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
      _id: { $ne: new ObjectId(id) },
    });
    if (existing) {
      res.status(409).json({ error: "A discount with this code already exists" });
      return;
    }
    update.code = code;
  }

  if ("productIds" in parsed.data) {
    update.productIds = (parsed.data.productIds ?? []).filter((pid) =>
      ObjectId.isValid(pid)
    );
  }

  if ("expiresAt" in parsed.data) {
    update.expiresAt = parsed.data.expiresAt
      ? new Date(parsed.data.expiresAt)
      : null;
  }

  const result = await db.collection(COLLECTION).findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: update },
    { returnDocument: "after" }
  );

  if (!result) {
    res.status(404).json({ error: "Discount not found" });
    return;
  }

  res.json({
    id: result._id.toString(),
    code: result.code,
    type: result.type,
    value: result.value,
    productIds: result.productIds ?? [],
    minOrderAmount: result.minOrderAmount ?? null,
    maxUsage: result.maxUsage ?? null,
    usedCount: result.usedCount ?? 0,
    expiresAt: result.expiresAt?.toISOString() ?? null,
    status: result.status ?? "active",
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
  });
}

export async function deleteDiscount(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const id = req.params.id;
  if (!id || !ObjectId.isValid(id)) {
    res.status(400).json({ error: "Invalid discount ID" });
    return;
  }

  const db = getDb();
  const result = await db.collection(COLLECTION).deleteOne({
    _id: new ObjectId(id),
  });

  if (result.deletedCount === 0) {
    res.status(404).json({ error: "Discount not found" });
    return;
  }

  res.status(204).send();
}
