import type { Response } from "express";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getDb } from "../db/mongodb.js";
import { getNextOrderNumber } from "../lib/order-number.js";
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
  status: z
    .enum(["pending", "paid", "confirmed", "processing", "shipped", "delivered", "cancelled"])
    .optional(),
  notes: z.string().max(1000).optional().nullable(),
});

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const ORDER_SORT_FIELDS = ["orderNumber", "createdAt", "total", "status"] as const;
const SORT_ORDERS = ["asc", "desc"] as const;

export async function listOrders(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const db = getDb();
  const status = req.query.status as string | undefined;
  const paymentStatus = req.query.paymentStatus as string | undefined;
  const search = (req.query.search as string | undefined)?.trim();
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;
  const sortByRaw = req.query.sortBy as string | undefined;
  const sortOrderRaw = req.query.sortOrder as string | undefined;
  const limitRaw = req.query.limit as string | undefined;
  const offsetRaw = req.query.offset as string | undefined;

  const sortBy: (typeof ORDER_SORT_FIELDS)[number] = ORDER_SORT_FIELDS.includes(
    sortByRaw as (typeof ORDER_SORT_FIELDS)[number]
  )
    ? (sortByRaw as (typeof ORDER_SORT_FIELDS)[number])
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
  if (startDate && endDate) {
    const start = new Date(startDate + "T00:00:00.000Z");
    const end = new Date(endDate + "T23:59:59.999Z");
    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && start <= end) {
      filter.createdAt = { $gte: start, $lte: end };
    }
  }
  if (status && ["pending", "paid", "shipped", "cancelled", "confirmed", "processing", "delivered"].includes(status)) {
    filter.status = status;
  }
  if (paymentStatus && ["pending", "completed", "failed"].includes(paymentStatus)) {
    filter.paymentStatus = paymentStatus;
  }
  if (search && search.length > 0) {
    const pattern = escapeRegex(search);
    const regex = { $regex: pattern, $options: "i" };
    filter.$or = [
      { orderNumber: regex },
      { customerEmail: regex },
      { customerName: regex },
    ];
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
    items: items.map((r) => ({
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
      shiprocketError: r.shiprocketError ?? null,
    })),
    total,
  });
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
    razorpayOrderId: item.razorpayOrderId ?? null,
    razorpayPaymentId: item.razorpayPaymentId ?? null,
    shippingAmount: item.shippingAmount ?? 0,
    courierName: item.courierName ?? null,
    estimatedDelivery: item.estimatedDelivery ?? null,
    trackingNumber: item.trackingNumber ?? null,
    shiprocketShipmentId: item.shiprocketShipmentId ?? null,
    shiprocketError: item.shiprocketError ?? null,
    shiprocketErrorAt: item.shiprocketErrorAt ?? null,
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
