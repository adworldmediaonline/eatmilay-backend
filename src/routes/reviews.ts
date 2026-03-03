import type { Response } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db/mongodb.js";
import type { AuthenticatedRequest } from "../middleware/require-session.js";
import { adminUpdateReviewSchema } from "../lib/validations/review.js";

const COLLECTION = "review";

export async function listReviews(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const type = req.query.type as string | undefined;
  const status = req.query.status as string | undefined;
  const productId = req.query.productId as string | undefined;
  const limit = Math.min(
    Math.max(1, parseInt(req.query.limit as string, 10) || 50),
    100
  );
  const offset = Math.max(0, parseInt(req.query.offset as string, 10) || 0);

  const db = getDb();
  const filter: Record<string, unknown> = {};

  if (type && (type === "product" || type === "order")) {
    filter.type = type;
  }
  if (status && (status === "published" || status === "hidden")) {
    filter.status = status;
  }
  if (productId && ObjectId.isValid(productId)) {
    filter.productId = productId;
  }

  const [total, items] = await Promise.all([
    db.collection(COLLECTION).countDocuments(filter),
    db
      .collection(COLLECTION)
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .toArray(),
  ]);

  res.json({
    items: items.map((r) => ({
      id: r._id.toString(),
      type: r.type,
      productId: r.productId ?? null,
      orderId: r.orderId ?? null,
      orderNumber: r.orderNumber ?? null,
      customerId: r.customerId ?? null,
      customerName: r.customerName ?? null,
      rating: r.rating,
      title: r.title ?? null,
      body: r.body ?? null,
      status: r.status ?? "published",
      verifiedPurchase: r.verifiedPurchase ?? true,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
    total,
  });
}

export async function updateReview(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const id = req.params.id;
  if (!id || !ObjectId.isValid(id)) {
    res.status(400).json({ error: "Invalid review ID" });
    return;
  }

  const parsed = adminUpdateReviewSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid input",
      details: parsed.error.flatten(),
    });
    return;
  }

  const db = getDb();
  const result = await db.collection(COLLECTION).updateOne(
    { _id: new ObjectId(id) },
    { $set: { status: parsed.data.status, updatedAt: new Date() } }
  );

  if (result.matchedCount === 0) {
    res.status(404).json({ error: "Review not found" });
    return;
  }

  res.status(200).json({ ok: true, message: "Review updated" });
}

export async function deleteReview(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const id = req.params.id;
  if (!id || !ObjectId.isValid(id)) {
    res.status(400).json({ error: "Invalid review ID" });
    return;
  }

  const db = getDb();
  const result = await db.collection(COLLECTION).deleteOne({
    _id: new ObjectId(id),
  });

  if (result.deletedCount === 0) {
    res.status(404).json({ error: "Review not found" });
    return;
  }

  res.status(200).json({ ok: true, message: "Review deleted" });
}
