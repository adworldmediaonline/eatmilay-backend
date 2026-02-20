import type { Response } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db/mongodb.js";
import type { AuthenticatedRequest } from "../middleware/require-session.js";

const COLLECTION = "order";

const TRACK_BASE_URL = "https://shiprocket.co/tracking";

export async function getUserOrderByNumber(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const userId = req.session?.user?.id;
  const userEmail = req.session?.user?.email;
  const orderNumber = req.params.orderNumber;
  if (!userId || !userEmail || !orderNumber?.trim()) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const db = getDb();
  const order = await db.collection(COLLECTION).findOne({
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
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const trackingNumber = order.trackingNumber as string | null | undefined;
  const trackingUrl = trackingNumber ? `${TRACK_BASE_URL}/${trackingNumber}` : null;

  res.json({
    id: order._id.toString(),
    orderNumber: order.orderNumber,
    status: order.status ?? "pending",
    paymentMethod: order.paymentMethod ?? null,
    paymentStatus: order.paymentStatus ?? null,
    razorpayPaymentId: order.paymentMethod === "razorpay" ? (order.razorpayPaymentId ?? null) : null,
    razorpayOrderId: order.paymentMethod === "razorpay" ? (order.razorpayOrderId ?? null) : null,
    subtotal: order.subtotal ?? order.total,
    discountAmount: order.discountAmount ?? 0,
    shippingAmount: order.shippingAmount ?? 0,
    couponCode: order.couponCode ?? null,
    total: order.total,
    currency: order.currency ?? "INR",
    items: order.items ?? [],
    notes: order.notes ?? null,
    createdAt: order.createdAt,
    trackingNumber: trackingNumber ?? null,
    trackingUrl,
    courierName: order.courierName ?? null,
    estimatedDelivery: order.estimatedDelivery ?? null,
    shippingAddress: order.shippingAddress ?? null,
  });
}

export async function listUserOrders(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const userId = req.session?.user?.id;
  const userEmail = req.session?.user?.email;
  if (!userId || !userEmail) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const limitRaw = req.query.limit as string | undefined;
  const offsetRaw = req.query.offset as string | undefined;
  const limit = Math.min(
    Math.max(1, parseInt(limitRaw ?? "20", 10) || 20),
    50
  );
  const offset = Math.max(0, parseInt(offsetRaw ?? "0", 10) || 0);

  const db = getDb();
  const filter: Record<string, unknown> = {
    $or: [
      { customerId: userId },
      {
        customerId: { $in: [null, ""] },
        customerEmail: { $regex: new RegExp(`^${userEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
      },
    ],
  };

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

  const trackingBase = TRACK_BASE_URL;

  res.json({
    items: items.map((r) => {
      const trackingNumber = r.trackingNumber as string | null | undefined;
      const trackingUrl = trackingNumber
        ? `${trackingBase}/${trackingNumber}`
        : null;
      return {
        id: r._id.toString(),
        orderNumber: r.orderNumber,
        status: r.status ?? "pending",
        total: r.total,
        currency: r.currency ?? "INR",
        itemCount: Array.isArray(r.items)
          ? (r.items as Array<{ quantity?: number }>).reduce(
              (s: number, i: { quantity?: number }) => s + (i.quantity ?? 1),
              0
            )
          : 0,
        createdAt: r.createdAt,
        trackingNumber: trackingNumber ?? null,
        trackingUrl,
        courierName: r.courierName ?? null,
        estimatedDelivery: r.estimatedDelivery ?? null,
      };
    }),
    total,
  });
}
