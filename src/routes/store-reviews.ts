import type { Request, Response } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db/mongodb.js";
import type { AuthenticatedRequest } from "../middleware/require-session.js";
import {
  productReviewSchema,
  orderReviewSchema,
} from "../lib/validations/review.js";

const COLLECTION = "review";
const ELIGIBLE_ORDER_STATUSES = [
  "delivered",
  "shipped",
  "processing",
  "confirmed",
  "paid",
];

function isTempEmail(email: string | null | undefined): boolean {
  if (!email || typeof email !== "string") return true;
  return /^temp[-.]?[^@]*@/i.test(email) || email.includes("temp@");
}

function maskName(name: string | null | undefined): string {
  if (!name || typeof name !== "string") return "Anonymous";
  const trimmed = name.trim();
  if (trimmed.length === 0) return "Anonymous";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    const p = parts[0];
    return p && p.length > 2
      ? `${p[0]}${"*".repeat(p.length - 2)}${p.slice(-1)}`
      : "***";
  }
  const first = parts[0] ?? "";
  const last = parts[parts.length - 1] ?? "";
  return `${first[0] ?? ""}${"*".repeat(Math.max(0, first.length - 1))} ${last[0] ?? ""}.`;
}

function sanitizeText(s: string | null | undefined): string {
  if (!s || typeof s !== "string") return "";
  return s
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .trim();
}

export async function submitProductReview(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const userId = req.session?.user?.id;
  const userEmail = req.session?.user?.email;
  const userName = req.session?.user?.name;
  if (!userId || !userEmail) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (isTempEmail(userEmail)) {
    res.status(403).json({ error: "Sign in with a real account to review" });
    return;
  }

  const parsed = productReviewSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid input",
      details: parsed.error.flatten(),
    });
    return;
  }

  const { productId, orderId, rating, title, body } = parsed.data;
  const db = getDb();

  const order = await db.collection("order").findOne({
    _id: new ObjectId(orderId),
    $or: [
      { customerId: userId },
      {
        customerId: { $in: [null, ""] },
        customerEmail: { $regex: new RegExp(`^${userEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
      },
    ],
  });

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  if (!ELIGIBLE_ORDER_STATUSES.includes(order.status ?? "")) {
    res.status(400).json({ error: "Order must be delivered or in progress to review" });
    return;
  }

  const items = (order.items ?? []) as Array<{ productId?: string }>;
  const hasProduct = items.some(
    (i) => (i.productId ?? "") === productId || String(i.productId ?? "") === productId
  );
  if (!hasProduct) {
    res.status(403).json({ error: "You can only review products you purchased" });
    return;
  }

  const now = new Date();
  const doc = {
    type: "product" as const,
    productId,
    orderId,
    orderNumber: order.orderNumber ?? null,
    customerId: userId,
    customerName: userName ?? "Customer",
    rating,
    title: title ? sanitizeText(title) : null,
    body: body ? sanitizeText(body) : null,
    status: "published" as const,
    verifiedPurchase: true,
    createdAt: now,
    updatedAt: now,
  };

  const existing = await db.collection(COLLECTION).findOne({
    type: "product",
    customerId: userId,
    productId,
  });

  if (existing) {
    await db.collection(COLLECTION).updateOne(
      { _id: existing._id },
      {
        $set: {
          rating: doc.rating,
          title: doc.title,
          body: doc.body,
          orderId: doc.orderId,
          orderNumber: doc.orderNumber,
          updatedAt: now,
        },
      }
    );
    res.status(200).json({
      id: existing._id.toString(),
      message: "Review updated",
    });
    return;
  }

  const result = await db.collection(COLLECTION).insertOne(doc);
  res.status(201).json({
    id: result.insertedId.toString(),
    message: "Review submitted",
  });
}

export async function submitOrderReview(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const userId = req.session?.user?.id;
  const userEmail = req.session?.user?.email;
  const userName = req.session?.user?.name;
  if (!userId || !userEmail) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (isTempEmail(userEmail)) {
    res.status(403).json({ error: "Sign in with a real account to review" });
    return;
  }

  const parsed = orderReviewSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid input",
      details: parsed.error.flatten(),
    });
    return;
  }

  const { orderId, rating, title, body } = parsed.data;
  const db = getDb();

  const order = await db.collection("order").findOne({
    _id: new ObjectId(orderId),
    $or: [
      { customerId: userId },
      {
        customerId: { $in: [null, ""] },
        customerEmail: { $regex: new RegExp(`^${userEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
      },
    ],
  });

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  if (order.status !== "delivered") {
    res.status(400).json({ error: "Order must be delivered to review" });
    return;
  }

  const existing = await db.collection(COLLECTION).findOne({
    type: "order",
    orderId,
  });

  if (existing) {
    res.status(409).json({ error: "You have already reviewed this order" });
    return;
  }

  const now = new Date();
  const doc = {
    type: "order" as const,
    orderId,
    orderNumber: order.orderNumber ?? null,
    customerId: userId,
    customerName: userName ?? "Customer",
    rating,
    title: title ? sanitizeText(title) : null,
    body: body ? sanitizeText(body) : null,
    status: "published" as const,
    verifiedPurchase: true,
    createdAt: now,
    updatedAt: now,
  };

  const result = await db.collection(COLLECTION).insertOne(doc);
  res.status(201).json({
    id: result.insertedId.toString(),
    message: "Review submitted",
  });
}

export async function listProductReviews(
  req: Request,
  res: Response
): Promise<void> {
  const productId = req.params.productId;
  if (!productId || !ObjectId.isValid(productId)) {
    res.status(400).json({ error: "Invalid product ID" });
    return;
  }

  const cursor = req.query.cursor as string | undefined;
  const limit = Math.min(
    Math.max(1, parseInt(req.query.limit as string, 10) || 20),
    50
  );

  const db = getDb();
  const filter: Record<string, unknown> = {
    type: "product",
    productId,
    status: "published",
  };

  if (cursor && ObjectId.isValid(cursor)) {
    const lastDoc = await db.collection(COLLECTION).findOne(
      { _id: new ObjectId(cursor) },
      { projection: { createdAt: 1 } }
    );
    if (lastDoc?.createdAt) {
      filter.createdAt = { $lt: lastDoc.createdAt };
    }
  }

  const [reviews, aggResult] = await Promise.all([
    db
      .collection(COLLECTION)
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .toArray(),
    db
      .collection(COLLECTION)
      .aggregate([
        { $match: { type: "product", productId, status: "published" } },
        {
          $group: {
            _id: null,
            avgRating: { $avg: "$rating" },
            count: { $sum: 1 },
          },
        },
      ])
      .toArray(),
  ]);

  const hasMore = reviews.length > limit;
  const items = hasMore ? reviews.slice(0, limit) : reviews;
  const lastItem = items[items.length - 1];
  const nextCursor = hasMore && lastItem ? lastItem._id.toString() : null;

  const agg = aggResult[0] as { avgRating?: number; count?: number } | undefined;
  const averageRating = agg?.avgRating
    ? Math.round(agg.avgRating * 10) / 10
    : null;
  const totalCount = agg?.count ?? 0;

  res.json({
    items: items.map((r) => ({
      id: r._id.toString(),
      customerName: maskName(r.customerName),
      rating: r.rating,
      title: r.title ?? null,
      body: r.body ?? null,
      verifiedPurchase: r.verifiedPurchase ?? true,
      createdAt: r.createdAt,
    })),
    nextCursor,
    averageRating,
    totalCount,
  });
}

export async function getOrderReview(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const orderId = req.params.orderId;
  if (!orderId || !ObjectId.isValid(orderId)) {
    res.status(400).json({ error: "Invalid order ID" });
    return;
  }

  const userId = req.session?.user?.id;
  const userEmail = req.session?.user?.email;
  if (!userId || !userEmail) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const db = getDb();
  const order = await db.collection("order").findOne({
    _id: new ObjectId(orderId),
    $or: [
      { customerId: userId },
      {
        customerId: { $in: [null, ""] },
        customerEmail: { $regex: new RegExp(`^${userEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
      },
    ],
  });

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const review = await db.collection(COLLECTION).findOne({
    type: "order",
    orderId,
  });

  if (!review) {
    res.status(404).json({ error: "No review found" });
    return;
  }

  res.json({
    id: review._id.toString(),
    rating: review.rating,
    title: review.title ?? null,
    body: review.body ?? null,
    createdAt: review.createdAt,
  });
}

export async function canReviewProduct(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const productId = req.params.productId;
  if (!productId || !ObjectId.isValid(productId)) {
    res.status(400).json({ error: "Invalid product ID" });
    return;
  }

  const userId = req.session?.user?.id;
  const userEmail = req.session?.user?.email;
  if (!userId || !userEmail) {
    res.status(200).json({ canReview: false, reason: "sign_in" });
    return;
  }
  if (isTempEmail(userEmail)) {
    res.status(200).json({ canReview: false, reason: "sign_in" });
    return;
  }

  const db = getDb();
  const order = await db.collection("order").findOne({
    $or: [
      { customerId: userId },
      {
        customerId: { $in: [null, ""] },
        customerEmail: { $regex: new RegExp(`^${userEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
      },
    ],
    status: { $in: ELIGIBLE_ORDER_STATUSES },
    "items.productId": productId,
  });

  if (!order) {
    res.status(200).json({ canReview: false, reason: "purchase_required" });
    return;
  }

  const existing = await db.collection(COLLECTION).findOne({
    type: "product",
    customerId: userId,
    productId,
  });

  res.status(200).json({
    canReview: true,
    reason: existing ? "update" : "create",
    orderId: order._id.toString(),
  });
}

export async function canReviewOrder(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const orderNumber = req.params.orderNumber;
  if (!orderNumber?.trim()) {
    res.status(400).json({ error: "Invalid order number" });
    return;
  }

  const userId = req.session?.user?.id;
  const userEmail = req.session?.user?.email;
  if (!userId || !userEmail) {
    res.status(200).json({ canReview: false, reason: "sign_in" });
    return;
  }
  if (isTempEmail(userEmail)) {
    res.status(200).json({ canReview: false, reason: "sign_in" });
    return;
  }

  const db = getDb();
  const order = await db.collection("order").findOne({
    orderNumber: { $regex: new RegExp(`^${orderNumber.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
    $or: [
      { customerId: userId },
      {
        customerId: { $in: [null, ""] },
        customerEmail: { $regex: new RegExp(`^${userEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
      },
    ],
  });

  if (!order) {
    res.status(200).json({ canReview: false, reason: "not_found" });
    return;
  }

  if (order.status !== "delivered") {
    res.status(200).json({ canReview: false, reason: "not_delivered" });
    return;
  }

  const existing = await db.collection(COLLECTION).findOne({
    type: "order",
    orderId: order._id.toString(),
  });

  if (existing) {
    res.status(200).json({ canReview: false, reason: "already_reviewed" });
    return;
  }

  res.status(200).json({
    canReview: true,
    orderId: order._id.toString(),
  });
}
