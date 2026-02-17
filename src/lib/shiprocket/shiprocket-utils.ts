/**
 * Shiprocket utility functions - order mapping and validation
 */

import type { ShiprocketCreateOrderPayload, ShiprocketOrderItem } from "./types.js";

export type ShippingAddressData = {
  fullName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export type MongoOrderDoc = {
  orderNumber: string;
  createdAt: Date;
  items: Array<{
    productId: string;
    productName: string;
    variantIndex?: number;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  shippingAddress: unknown;
  paymentMethod?: string;
  subtotal: number;
  discountAmount?: number;
  shippingAmount?: number;
};

export function convertOrderToShiprocketFormat(
  order: MongoOrderDoc,
  shippingAddress: ShippingAddressData,
  pickupLocation: string = "Primary"
): ShiprocketCreateOrderPayload {
  const address =
    typeof order.shippingAddress === "string"
      ? (JSON.parse(order.shippingAddress) as ShippingAddressData)
      : (order.shippingAddress as ShippingAddressData);

  const fullName = address?.fullName ?? shippingAddress.fullName ?? "";
  const nameParts = fullName.trim().split(/\s+/);
  const firstName = nameParts[0] ?? "";
  const lastName = nameParts.slice(1).join(" ") || undefined;

  const orderItems: ShiprocketOrderItem[] = order.items.map((item) => ({
    name: item.productName,
    sku: `PROD-${item.productId}`,
    units: item.quantity,
    selling_price: item.unitPrice,
    discount: 0,
    tax: 0,
  }));

  const paymentMethod = order.paymentMethod === "cod" ? "COD" : "Prepaid";
  const defaultWeight = 0.5;
  const totalWeight = Math.max(
    order.items.reduce((sum, item) => sum + item.quantity * defaultWeight, 0),
    0.1
  );

  const phoneNumber = (address?.phone ?? shippingAddress.phone).replace(/\D/g, "").slice(-10);

  return {
    order_id: order.orderNumber,
    order_date: new Date(order.createdAt).toISOString().split("T")[0] ?? "",
    pickup_location: pickupLocation,
    billing_customer_name: firstName,
    billing_last_name: lastName,
    billing_address: address?.addressLine1 ?? shippingAddress.addressLine1,
    billing_address_2: address?.addressLine2 ?? shippingAddress.addressLine2,
    billing_isd_code: "+91",
    billing_city: address?.city ?? shippingAddress.city,
    billing_pincode: address?.postalCode ?? shippingAddress.postalCode,
    billing_state: address?.state ?? shippingAddress.state,
    billing_country: address?.country ?? shippingAddress.country ?? "India",
    billing_email: address?.email ?? shippingAddress.email,
    billing_phone: phoneNumber,
    shipping_is_billing: true,
    order_items: orderItems,
    payment_method: paymentMethod,
    shipping_charges: order.shippingAmount ?? 0,
    total_discount: order.discountAmount ?? 0,
    sub_total: order.subtotal,
    weight: totalWeight,
    length: 10,
    breadth: 10,
    height: 5,
  };
}

export function validateShiprocketPayload(
  payload: ShiprocketCreateOrderPayload
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!payload.order_id) errors.push("Order ID is required");
  if (!payload.billing_customer_name) errors.push("Billing customer name is required");
  if (!payload.billing_address) errors.push("Billing address is required");
  if (!payload.billing_city) errors.push("Billing city is required");
  if (!payload.billing_pincode) errors.push("Billing pincode is required");
  if (!payload.billing_state) errors.push("Billing state is required");
  if (!payload.billing_email) errors.push("Billing email is required");
  if (!payload.billing_phone) errors.push("Billing phone is required");
  if (!payload.order_items?.length) errors.push("At least one order item is required");

  payload.order_items?.forEach((item, index) => {
    if (!item.name) errors.push(`Item ${index + 1}: Name is required`);
    if (!item.sku) errors.push(`Item ${index + 1}: SKU is required`);
    if (!item.units || item.units < 1) errors.push(`Item ${index + 1}: Units must be at least 1`);
    if (!item.selling_price || item.selling_price <= 0) errors.push(`Item ${index + 1}: Selling price must be greater than 0`);
  });

  if (payload.billing_phone && !/^\d{10}$/.test(payload.billing_phone)) {
    errors.push("Billing phone must be exactly 10 digits");
  }
  if (payload.billing_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.billing_email)) {
    errors.push("Invalid billing email format");
  }
  if (payload.billing_pincode && !/^\d{6}$/.test(payload.billing_pincode)) {
    errors.push("Billing pincode must be exactly 6 digits");
  }

  return { valid: errors.length === 0, errors };
}

export function formatPhoneForShiprocket(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}
