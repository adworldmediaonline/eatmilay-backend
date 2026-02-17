import type { Response } from "express";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getDb } from "../db/mongodb.js";
import type { AuthenticatedRequest } from "../middleware/require-session.js";

const COLLECTION = "order";

const orderItemSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  variantIndex: z.number().int().min(0).optional(),
  quantity: z.number().int().min(1),
  unitPrice: z.number().min(0),
  lineTotal: z.number().min(0),
});

const createSchema = z.object({
  customerId: z.string().optional().nullable(),
  customerEmail: z.string().email(),
  customerName: z.string().max(200).optional().nullable(),
  items: z.array(orderItemSchema).min(1),
  subtotal: z.number().min(0),
  discountAmount: z.number().min(0).default(0),
  total: z.number().min(0),
  currency: z.string().max(5).default("USD"),
  couponCode: z.string().max(50).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

const updateSchema = z.object({
  status: z.enum(["pending", "paid", "shipped", "cancelled"]).optional(),
  notes: z.string().max(1000).optional().nullable(),
});

async function getNextOrderNumber(db: ReturnType<typeof getDb>): Promise<string> {
  const count = await db.collection(COLLECTION).countDocuments();
  const num = count + 1;
  return `ORD-${num.toString().padStart(4, "0")}`;
}

export async function listOrders(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const db = getDb();
  const status = req.query.status as string | undefined;
  const paymentStatus = req.query.paymentStatus as string | undefined;

  const filter: Record<string, unknown> = {};
  if (status && ["pending", "paid", "shipped", "cancelled", "confirmed", "processing", "delivered"].includes(status)) {
    filter.status = status;
  }
  if (paymentStatus && ["pending", "completed", "failed"].includes(paymentStatus)) {
    filter.paymentStatus = paymentStatus;
  }

  const items = await db
    .collection(COLLECTION)
    .find(filter)
    .sort({ createdAt: -1 })
    .toArray();

  res.json(
    items.map((r) => ({
      id: r._id.toString(),
      orderNumber: r.orderNumber,
      customerId: r.customerId ?? null,
      customerEmail: r.customerEmail,
      customerName: r.customerName ?? null,
      items: r.items ?? [],
      subtotal: r.subtotal,
      discountAmount: r.discountAmount ?? 0,
      total: r.total,
      currency: r.currency ?? "USD",
      status: r.status ?? "pending",
      couponCode: r.couponCode ?? null,
      notes: r.notes ?? null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      shippingAddress: r.shippingAddress ?? null,
      paymentMethod: r.paymentMethod ?? null,
      paymentStatus: r.paymentStatus ?? null,
      shippingAmount: r.shippingAmount ?? 0,
      courierName: r.courierName ?? null,
      estimatedDelivery: r.estimatedDelivery ?? null,
      trackingNumber: r.trackingNumber ?? null,
      shiprocketShipmentId: r.shiprocketShipmentId ?? null,
    }))
  );
}

export async function getOrder(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const id = req.params.id;
  if (!id || !ObjectId.isValid(id)) {
    res.status(400).json({ error: "Invalid order ID" });
    return;
  }

  const db = getDb();
  const item = await db.collection(COLLECTION).findOne({
    _id: new ObjectId(id),
  });

  if (!item) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  res.json({
    id: item._id.toString(),
    orderNumber: item.orderNumber,
    customerId: item.customerId ?? null,
    customerEmail: item.customerEmail,
    customerName: item.customerName ?? null,
    items: item.items ?? [],
    subtotal: item.subtotal,
    discountAmount: item.discountAmount ?? 0,
    total: item.total,
    currency: item.currency ?? "USD",
    status: item.status ?? "pending",
    couponCode: item.couponCode ?? null,
    notes: item.notes ?? null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    shippingAddress: item.shippingAddress ?? null,
    paymentMethod: item.paymentMethod ?? null,
    paymentStatus: item.paymentStatus ?? null,
    shippingAmount: item.shippingAmount ?? 0,
    courierName: item.courierName ?? null,
    estimatedDelivery: item.estimatedDelivery ?? null,
    trackingNumber: item.trackingNumber ?? null,
    shiprocketShipmentId: item.shiprocketShipmentId ?? null,
  });
}

export async function createOrder(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }

  const db = getDb();
  const orderNumber = await getNextOrderNumber(db);

  const doc = {
    orderNumber,
    customerId: parsed.data.customerId ?? null,
    customerEmail: parsed.data.customerEmail,
    customerName: parsed.data.customerName ?? null,
    items: parsed.data.items,
    subtotal: parsed.data.subtotal,
    discountAmount: parsed.data.discountAmount ?? 0,
    total: parsed.data.total,
    currency: parsed.data.currency ?? "USD",
    status: "pending" as const,
    couponCode: parsed.data.couponCode ?? null,
    notes: parsed.data.notes ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await db.collection(COLLECTION).insertOne(doc);
  res.status(201).json({
    id: result.insertedId.toString(),
    ...doc,
  });
}

export async function updateOrder(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const id = req.params.id;
  if (!id || !ObjectId.isValid(id)) {
    res.status(400).json({ error: "Invalid order ID" });
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

  const result = await db.collection(COLLECTION).findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: update },
    { returnDocument: "after" }
  );

  if (!result) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  res.json({
    id: result._id.toString(),
    orderNumber: result.orderNumber,
    customerId: result.customerId ?? null,
    customerEmail: result.customerEmail,
    customerName: result.customerName ?? null,
    items: result.items ?? [],
    subtotal: result.subtotal,
    discountAmount: result.discountAmount ?? 0,
    total: result.total,
    currency: result.currency ?? "USD",
    status: result.status ?? "pending",
    couponCode: result.couponCode ?? null,
    notes: result.notes ?? null,
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
    shippingAddress: result.shippingAddress ?? null,
    paymentMethod: result.paymentMethod ?? null,
    paymentStatus: result.paymentStatus ?? null,
    shippingAmount: result.shippingAmount ?? 0,
    courierName: result.courierName ?? null,
    estimatedDelivery: result.estimatedDelivery ?? null,
    trackingNumber: result.trackingNumber ?? null,
    shiprocketShipmentId: result.shiprocketShipmentId ?? null,
  });
}
