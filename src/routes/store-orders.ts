import type { Request, Response } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db/mongodb.js";
import { getNextOrderNumber } from "../lib/order-number.js";
import { createOrderSchema } from "../lib/validations/order.js";
import { createRazorpayOrder } from "../lib/razorpay/razorpay-client.js";
import {
  sendOrderConfirmationEmail,
  type OrderDoc,
} from "../lib/email/send-order-confirmation.js";
import { validateDiscountForOrder } from "../lib/discount-validation.js";

const COLLECTION = "order";

export async function createStoreOrder(req: Request, res: Response): Promise<void> {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }

  const {
    customerId,
    customerEmail,
    customerName,
    items,
    subtotal,
    discountAmount: clientDiscountAmount,
    total,
    currency,
    couponCode,
    customerReferralCode,
    notes,
    shippingAddress,
    paymentMethod,
    shippingAmount,
    courierId,
    courierName,
    estimatedDelivery,
  } = parsed.data;

  let discountAmount = clientDiscountAmount ?? 0;

  const db = getDb();
  if (couponCode?.trim() && clientDiscountAmount != null && clientDiscountAmount > 0) {
    const validationItems = items.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
    }));
    const productIds = items.map((i) => i.productId).filter(Boolean);
    let itemCategoryIds: Record<string, string | null> | undefined;
    if (productIds.length > 0) {
      const objectIds = productIds
        .filter((id) => ObjectId.isValid(id))
        .map((id) => new ObjectId(id));
      const products =
        objectIds.length > 0
          ? await db
              .collection("product")
              .find({ _id: { $in: objectIds } })
              .project({ _id: 1, categoryId: 1 })
              .toArray()
          : [];
      itemCategoryIds = {};
      for (const p of products) {
        const id = p._id.toString();
        itemCategoryIds[id] = (p.categoryId as string) ?? null;
      }
    }
    const result = await validateDiscountForOrder(
      couponCode,
      subtotal,
      validationItems,
      {
        customerEmail: customerEmail ?? undefined,
        customerReferralCode: customerReferralCode ?? undefined,
        itemCategoryIds,
      }
    );
    if (!result.valid) {
      res.status(400).json({
        error: "COUPON_INVALID",
        message: result.message,
      });
      return;
    }
    discountAmount = result.discountAmount;
  }

  const orderNumber = await getNextOrderNumber(db);

  const totalAmount =
    discountAmount !== (clientDiscountAmount ?? 0)
      ? Math.max(0, subtotal - discountAmount + (shippingAmount ?? 0))
      : total;
  let razorpayOrderId: string | null = null;
  let paymentStatus: "pending" | "completed" | "failed" = "pending";
  let status: "pending" | "paid" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled" = "pending";

  if (paymentMethod === "razorpay") {
    try {
      const razorpayOrder = await createRazorpayOrder(
        totalAmount,
        orderNumber,
        { customerEmail }
      );
      razorpayOrderId = razorpayOrder.id;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create payment order";
      res.status(500).json({ error: message });
      return;
    }
  } else if (paymentMethod === "cod") {
    paymentStatus = "completed";
    status = "paid";
  }

  const doc = {
    orderNumber,
    customerId: customerId ?? null,
    customerEmail,
    customerName: customerName ?? null,
    items,
    subtotal,
    discountAmount: discountAmount ?? 0,
    total: totalAmount,
    currency: currency ?? "INR",
    status,
    paymentMethod,
    paymentStatus,
    razorpayOrderId: razorpayOrderId ?? undefined,
    shippingAddress,
    shippingAmount: shippingAmount ?? 0,
    courierId: courierId ?? undefined,
    courierName: courierName ?? undefined,
    estimatedDelivery: estimatedDelivery ?? undefined,
    couponCode: couponCode ?? null,
    notes: notes ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await db.collection(COLLECTION).insertOne(doc);
  const id = result.insertedId.toString();

  if (customerId) {
    await db.collection("cart").deleteMany({ customerId });
  }

  if (paymentMethod === "cod" && status === "paid") {
    void sendOrderConfirmationEmail(doc as unknown as OrderDoc);
  }

  res.status(201).json({
    id,
    orderNumber,
    total: totalAmount,
    razorpayOrderId: razorpayOrderId ?? undefined,
    paymentMethod,
    paymentStatus,
    items: items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
    })),
  });
}

const TRACK_BASE_URL = "https://track.shiprocket.in/tracking";

export async function getOrderTracking(req: Request, res: Response): Promise<void> {
  const orderNumber = (req.query.orderNumber as string)?.trim();
  const email = (req.query.email as string)?.trim();

  if (!orderNumber || !email) {
    res.status(400).json({ error: "Order number and email are required" });
    return;
  }

  const db = getDb();
  const order = await db.collection(COLLECTION).findOne({
    orderNumber: { $regex: new RegExp(`^${orderNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
    customerEmail: { $regex: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
  });

  if (!order) {
    res.status(404).json({ error: "Order not found. Please check your order number and email." });
    return;
  }

  const trackingNumber = order.trackingNumber as string | null | undefined;
  const trackingUrl = trackingNumber ? `${TRACK_BASE_URL}/${trackingNumber}` : null;

  res.json({
    orderNumber: order.orderNumber,
    status: order.status,
    trackingNumber: trackingNumber ?? null,
    trackingUrl,
    courierName: order.courierName ?? null,
    estimatedDelivery: order.estimatedDelivery ?? null,
    shiprocketError: order.shiprocketError ?? null,
  });
}
