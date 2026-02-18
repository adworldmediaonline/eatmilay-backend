import type { Response } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db/mongodb.js";
import { createShiprocketOrder } from "../lib/shiprocket/create-shiprocket-order.js";
import { trackShiprocketOrder } from "../lib/shiprocket/shiprocket-tracking.js";
import {
  sendOrderShippedEmail,
  type OrderDoc,
} from "../lib/email/send-order-confirmation.js";
import type { AuthenticatedRequest } from "../middleware/require-session.js";

const COLLECTION = "order";

export async function createShiprocketOrderForAdmin(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const { id } = req.params;
  if (!id) {
    res.status(400).json({ error: "Order ID is required" });
    return;
  }

  const result = await createShiprocketOrder(id);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  const db = getDb();
  let objectId: ObjectId;
  try {
    objectId = new ObjectId(id);
  } catch {
    res.json({ success: true, data: result.data });
    return;
  }

  const updated = await db.collection(COLLECTION).findOne({ _id: objectId });
  if (
    updated &&
    updated.customerEmail &&
    updated.shippingAddress &&
    typeof updated.shippingAddress === "object"
  ) {
    void sendOrderShippedEmail(updated as unknown as OrderDoc);
  }

  res.json({
    success: true,
    data: result.data,
  });
}

export async function trackShiprocketOrderForAdmin(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const { id } = req.params;
  if (!id) {
    res.status(400).json({ error: "Order ID is required" });
    return;
  }

  const db = getDb();
  let objectId: ObjectId;
  try {
    objectId = new ObjectId(id);
  } catch {
    res.status(400).json({ error: "Invalid order ID" });
    return;
  }

  const order = await db.collection(COLLECTION).findOne({ _id: objectId });
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const shipmentId = order.shiprocketShipmentId;
  const trackingNumber = order.trackingNumber;
  const orderNumber = order.orderNumber;

  if (!shipmentId && !trackingNumber) {
    res.status(400).json({ error: "Order has no Shiprocket shipment yet. Create one first." });
    return;
  }

  try {
    const tracking = await trackShiprocketOrder({
      shipmentId: shipmentId ?? undefined,
      awbCode: typeof trackingNumber === "string" ? trackingNumber : undefined,
      channelOrderId: orderNumber,
    });
    res.json(tracking);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch tracking";
    res.status(500).json({ error: message });
  }
}
