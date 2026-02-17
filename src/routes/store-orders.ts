import type { Request, Response } from "express";
import { getDb } from "../db/mongodb.js";
import { createOrderSchema } from "../lib/validations/order.js";
import { createRazorpayOrder } from "../lib/razorpay/razorpay-client.js";

const COLLECTION = "order";

async function getNextOrderNumber(db: ReturnType<typeof getDb>): Promise<string> {
  const count = await db.collection(COLLECTION).countDocuments();
  const num = count + 1;
  return `ORD-${num.toString().padStart(4, "0")}`;
}

export async function createStoreOrder(req: Request, res: Response): Promise<void> {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }

  const db = getDb();
  const orderNumber = await getNextOrderNumber(db);

  const {
    customerId,
    customerEmail,
    customerName,
    items,
    subtotal,
    discountAmount,
    total,
    currency,
    couponCode,
    notes,
    shippingAddress,
    paymentMethod,
    shippingAmount,
    courierId,
    courierName,
    estimatedDelivery,
  } = parsed.data;

  const totalAmount = total;
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
