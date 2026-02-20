import type { Response } from "express";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getDb } from "../db/mongodb.js";
import type { AuthenticatedRequest } from "../middleware/require-session.js";

const COLLECTION = "discount";

const discountBaseSchema = z.object({
  code: z.string().min(1).max(50),
  type: z.enum(["percentage", "fixed"]),
  value: z.number().min(0),
  description: z.string().max(200).optional().nullable(),
  allowAutoApply: z.boolean().optional().default(true),
  productIds: z.array(z.string()).optional(),
  minOrderAmount: z.number().min(0).optional().nullable(),
  maxUsage: z.number().int().min(0).optional().nullable(),
  startsAt: z.union([z.string(), z.date()]).optional().nullable(),
  expiresAt: z.union([z.string(), z.date()]).optional().nullable(),
  status: z.enum(["active", "disabled", "scheduled"]).default("active"),
});

const createSchema = discountBaseSchema.refine(
  (data) => {
    const start = data.startsAt ? new Date(data.startsAt) : null;
    const end = data.expiresAt ? new Date(data.expiresAt) : null;
    if (start && end && start >= end) return false;
    return true;
  },
  { message: "startsAt must be before expiresAt", path: ["expiresAt"] }
);

const updateSchema = discountBaseSchema.partial().refine(
  (data) => {
    const start = data.startsAt ? new Date(data.startsAt) : null;
    const end = data.expiresAt ? new Date(data.expiresAt) : null;
    if (start && end && start >= end) return false;
    return true;
  },
  { message: "startsAt must be before expiresAt", path: ["expiresAt"] }
);

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const DISCOUNT_SORT_FIELDS = ["code", "createdAt", "updatedAt", "status"] as const;
const SORT_ORDERS = ["asc", "desc"] as const;

export async function listDiscounts(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const db = getDb();
  const status = req.query.status as string | undefined;
  const search = (req.query.search as string | undefined)?.trim();
  const sortByRaw = req.query.sortBy as string | undefined;
  const sortOrderRaw = req.query.sortOrder as string | undefined;
  const limitRaw = req.query.limit as string | undefined;
  const offsetRaw = req.query.offset as string | undefined;

  const sortBy: (typeof DISCOUNT_SORT_FIELDS)[number] = DISCOUNT_SORT_FIELDS.includes(
    sortByRaw as (typeof DISCOUNT_SORT_FIELDS)[number]
  )
    ? (sortByRaw as (typeof DISCOUNT_SORT_FIELDS)[number])
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
  if (status && ["active", "disabled", "scheduled"].includes(status)) {
    filter.status = status;
  }
  if (search && search.length > 0) {
    const pattern = escapeRegex(search);
    const regex = { $regex: pattern, $options: "i" };
    filter.code = regex;
  }

  const sortDir = sortOrder === "asc" ? 1 : -1;
  const sortObj: Record<string, 1 | -1> = { [sortBy]: sortDir };

  const [total, items] = await Promise.all([
    db.collection(COLLECTION).countDocuments(filter),
    db
      .collection(COLLECTION)
      .find(filter)
      .sort(sortObj)
      .skip(offset)
      .limit(limit)
      .toArray(),
  ]);

  res.json({
    items: items.map((r) => {
      const statusVal = r.status ?? "active";
      const startsAt = r.startsAt ?? null;
      const expiresAt = r.expiresAt ?? null;
      const now = new Date();
      let effectiveStatus = statusVal;
      if (statusVal === "active" && expiresAt && new Date(expiresAt) < now) {
        effectiveStatus = "expired";
      } else if (statusVal === "scheduled" && startsAt && new Date(startsAt) > now) {
        effectiveStatus = "scheduled";
      } else if (statusVal === "scheduled" && (!startsAt || new Date(startsAt) <= now)) {
        effectiveStatus = "active";
      }
      return {
        id: r._id.toString(),
        code: r.code,
        type: r.type,
        value: r.value,
        description: r.description ?? null,
        allowAutoApply: r.allowAutoApply ?? true,
        productIds: r.productIds ?? [],
        minOrderAmount: r.minOrderAmount ?? null,
        maxUsage: r.maxUsage ?? null,
        usedCount: r.usedCount ?? 0,
        startsAt: r.startsAt ?? null,
        expiresAt: r.expiresAt ?? null,
        status: statusVal,
        effectiveStatus,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
    }),
    total,
  });
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

  const statusVal = item.status ?? "active";
  const startsAt = item.startsAt ?? null;
  const expiresAt = item.expiresAt ?? null;
  const now = new Date();
  let effectiveStatus = statusVal;
  if (statusVal === "active" && expiresAt && new Date(expiresAt) < now) {
    effectiveStatus = "expired";
  } else if (statusVal === "scheduled" && startsAt && new Date(startsAt) > now) {
    effectiveStatus = "scheduled";
  } else if (statusVal === "scheduled" && (!startsAt || new Date(startsAt) <= now)) {
    effectiveStatus = "active";
  }

  res.json({
    id: item._id.toString(),
    code: item.code,
    type: item.type,
    value: item.value,
    description: item.description ?? null,
    allowAutoApply: item.allowAutoApply ?? true,
    productIds: item.productIds ?? [],
    minOrderAmount: item.minOrderAmount ?? null,
    maxUsage: item.maxUsage ?? null,
    usedCount: item.usedCount ?? 0,
    startsAt: item.startsAt ?? null,
    expiresAt: item.expiresAt ?? null,
    status: statusVal,
    effectiveStatus,
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
  const startsAt = parsed.data.startsAt
    ? new Date(parsed.data.startsAt)
    : null;
  const expiresAt = parsed.data.expiresAt
    ? new Date(parsed.data.expiresAt)
    : null;

  const now = new Date();
  let status = parsed.data.status ?? "active";
  if (status === "active" && startsAt && startsAt > now) {
    status = "scheduled";
  }

  const doc = {
    code,
    type: parsed.data.type,
    value: parsed.data.value,
    description: parsed.data.description?.trim() || null,
    allowAutoApply: parsed.data.allowAutoApply ?? true,
    productIds,
    minOrderAmount: parsed.data.minOrderAmount ?? null,
    maxUsage: parsed.data.maxUsage ?? null,
    usedCount: 0,
    startsAt,
    expiresAt,
    status,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await db.collection(COLLECTION).insertOne(doc);
  res.status(201).json({
    id: result.insertedId.toString(),
    ...doc,
    startsAt: doc.startsAt?.toISOString() ?? null,
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

  if ("startsAt" in parsed.data) {
    update.startsAt = parsed.data.startsAt
      ? new Date(parsed.data.startsAt)
      : null;
  }
  if ("expiresAt" in parsed.data) {
    update.expiresAt = parsed.data.expiresAt
      ? new Date(parsed.data.expiresAt)
      : null;
  }

  const startsAtVal = update.startsAt as Date | undefined;
  if (
    parsed.data.status !== "disabled" &&
    startsAtVal &&
    new Date(startsAtVal) > new Date()
  ) {
    update.status = "scheduled";
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

  const statusVal = result.status ?? "active";
  const itemStartsAt = result.startsAt ?? null;
  const itemExpiresAt = result.expiresAt ?? null;
  const itemNow = new Date();
  let effectiveStatus = statusVal;
  if (statusVal === "active" && itemExpiresAt && new Date(itemExpiresAt) < itemNow) {
    effectiveStatus = "expired";
  } else if (statusVal === "scheduled" && itemStartsAt && new Date(itemStartsAt) > itemNow) {
    effectiveStatus = "scheduled";
  } else if (statusVal === "scheduled" && (!itemStartsAt || new Date(itemStartsAt) <= itemNow)) {
    effectiveStatus = "active";
  }

  res.json({
    id: result._id.toString(),
    code: result.code,
    type: result.type,
    value: result.value,
    description: result.description ?? null,
    allowAutoApply: result.allowAutoApply ?? true,
    productIds: result.productIds ?? [],
    minOrderAmount: result.minOrderAmount ?? null,
    maxUsage: result.maxUsage ?? null,
    usedCount: result.usedCount ?? 0,
    startsAt: result.startsAt?.toISOString() ?? null,
    expiresAt: result.expiresAt?.toISOString() ?? null,
    status: statusVal,
    effectiveStatus,
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
