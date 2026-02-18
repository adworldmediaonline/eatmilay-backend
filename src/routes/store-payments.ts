import type { Request, Response } from "express";
import { getDb } from "../db/mongodb.js";
import { verifyPaymentSchema } from "../lib/validations/order.js";
import { verifyPaymentSignature } from "../lib/razorpay/razorpay-verify.js";
import { createShiprocketOrder } from "../lib/shiprocket/create-shiprocket-order.js";
import {
  sendOrderConfirmationEmail,
  type OrderDoc,
} from "../lib/email/send-order-confirmation.js";

const COLLECTION = "order";

export async function verifyPayment(req: Request, res: Response): Promise<void> {
  const parsed = verifyPaymentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }

  const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = parsed.data;

  const isValid = verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
  if (!isValid) {
    res.status(400).json({ error: "Invalid payment signature" });
    return;
  }

  const db = getDb();
  const { ObjectId } = await import("mongodb");
  let objectId: import("mongodb").ObjectId;
  try {
    objectId = new ObjectId(orderId);
  } catch {
    res.status(400).json({ error: "Invalid order ID" });
    return;
  }

  const order = await db.collection(COLLECTION).findOne({ _id: objectId });
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  if (order.razorpayOrderId !== razorpay_order_id) {
    res.status(400).json({ error: "Order ID does not match Razorpay order" });
    return;
  }

  await db.collection(COLLECTION).updateOne(
    { _id: objectId },
    {
      $set: {
        paymentStatus: "completed",
        status: "paid",
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        updatedAt: new Date(),
      },
    }
  );

  void sendOrderConfirmationEmail(order as unknown as OrderDoc);

  try {
    const result = await createShiprocketOrder(orderId);
    if (!result.success) {
      const errMsg = `Order ${orderId} (${order.orderNumber}): ${result.error}`;
      console.error("Shiprocket order creation failed:", errMsg);
      await db.collection(COLLECTION).updateOne(
        { _id: objectId },
        {
          $set: {
            shiprocketError: result.error,
            shiprocketErrorAt: new Date(),
            updatedAt: new Date(),
          },
        }
      );
    } else {
      console.log(`Shiprocket order created for ${order.orderNumber} (orderId: ${orderId})`);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("Shiprocket order creation failed (non-blocking):", {
      orderId,
      orderNumber: order.orderNumber,
      error: errMsg,
    });
    await db.collection(COLLECTION).updateOne(
      { _id: objectId },
      {
        $set: {
          shiprocketError: errMsg,
          shiprocketErrorAt: new Date(),
          updatedAt: new Date(),
        },
      }
    ).catch(() => {});
  }

  res.json({
    success: true,
    orderId,
    orderNumber: order.orderNumber,
  });
}
