/**
 * Create Shiprocket order from MongoDB order (called after payment verification)
 */

import { ObjectId } from "mongodb";
import { getDb } from "../../db/mongodb.js";
import {
  convertOrderToShiprocketFormat,
  validateShiprocketPayload,
} from "./shiprocket-utils.js";
import { createShiprocketOrderApi } from "./shiprocket-orders.js";
import type { ShippingAddressData } from "./shiprocket-utils.js";

const COLLECTION = "order";
const DEFAULT_PICKUP = process.env.SHIPROCKET_PICKUP_LOCATION ?? "Primary";

export type CreateShiprocketResult =
  | { success: true; data: { shipmentId: number; awbCode: string | null; trackingNumber: string } }
  | { success: false; error: string };

export async function createShiprocketOrder(
  orderId: string,
  pickupLocation: string = DEFAULT_PICKUP
): Promise<CreateShiprocketResult> {
  const db = getDb();
  let objectId: ObjectId;
  try {
    objectId = new ObjectId(orderId);
  } catch {
    return { success: false, error: "Invalid order ID" };
  }

  const order = await db.collection(COLLECTION).findOne({ _id: objectId });
  if (!order) {
    return { success: false, error: "Order not found" };
  }

  if (order.trackingNumber) {
    return { success: false, error: "Order already has a shipment created" };
  }

  let shippingAddress: ShippingAddressData;
  try {
    shippingAddress =
      typeof order.shippingAddress === "string"
        ? (JSON.parse(order.shippingAddress) as ShippingAddressData)
        : (order.shippingAddress as ShippingAddressData);
  } catch {
    return { success: false, error: "Invalid shipping address format" };
  }

  const mongoOrder = {
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    items: order.items,
    shippingAddress: order.shippingAddress,
    paymentMethod: order.paymentMethod,
    subtotal: order.subtotal,
    discountAmount: order.discountAmount ?? 0,
    shippingAmount: order.shippingAmount ?? 0,
  };

  const payload = convertOrderToShiprocketFormat(mongoOrder, shippingAddress, pickupLocation);
  const validation = validateShiprocketPayload(payload);
  if (!validation.valid) {
    return { success: false, error: `Validation failed: ${validation.errors.join(", ")}` };
  }

  const result = await createShiprocketOrderApi(payload);
  if (!result.success) {
    return { success: false, error: result.error };
  }

  const { shipment_id, awb_code } = result.data;
  const trackingNumber = awb_code ?? `SR-${shipment_id}`;
  const shiprocketNotes = [
    `Shiprocket Order ID: ${result.data.order_id ?? ""}`,
    `Shiprocket Shipment ID: ${shipment_id}`,
    result.data.channel_order_id ? `Channel Order ID: ${result.data.channel_order_id}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  await db.collection(COLLECTION).updateOne(
    { _id: objectId },
    {
      $set: {
        trackingNumber,
        shiprocketShipmentId: shipment_id,
        notes: order.notes ? `${order.notes}\n\n${shiprocketNotes}` : shiprocketNotes,
        updatedAt: new Date(),
      },
    }
  );

  return {
    success: true,
    data: { shipmentId: shipment_id, awbCode: awb_code, trackingNumber },
  };
}
