import type { OrderEmailData } from "./types.js";
import { sendEmail } from "./send-email.js";
import { renderOrderConfirmation } from "./templates/order-confirmation.js";

export type OrderDoc = {
  orderNumber: string;
  customerEmail: string;
  customerName?: string | null;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  subtotal: number;
  discountAmount?: number;
  shippingAmount?: number;
  total: number;
  currency?: string;
  shippingAddress: {
    fullName: string;
    email: string;
    phone: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    postalCode: string;
    country?: string;
  };
  paymentMethod: string;
  estimatedDelivery?: string;
  createdAt?: Date;
};

function orderDocToEmailData(doc: OrderDoc): OrderEmailData {
  return {
    orderNumber: doc.orderNumber,
    customerEmail: doc.customerEmail,
    customerName: doc.customerName ?? null,
    items: doc.items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
    })),
    subtotal: doc.subtotal,
    discountAmount: doc.discountAmount ?? 0,
    shippingAmount: doc.shippingAmount ?? 0,
    total: doc.total,
    currency: doc.currency ?? "INR",
    shippingAddress: {
      fullName: doc.shippingAddress.fullName,
      email: doc.shippingAddress.email,
      phone: doc.shippingAddress.phone,
      addressLine1: doc.shippingAddress.addressLine1,
      addressLine2: doc.shippingAddress.addressLine2,
      city: doc.shippingAddress.city,
      state: doc.shippingAddress.state,
      postalCode: doc.shippingAddress.postalCode,
      country: doc.shippingAddress.country ?? "India",
    },
    paymentMethod: doc.paymentMethod,
    estimatedDelivery: doc.estimatedDelivery,
    createdAt: doc.createdAt,
  };
}

export async function sendOrderConfirmationEmail(orderDoc: OrderDoc): Promise<void> {
  const data = orderDocToEmailData(orderDoc);
  const { html, text } = renderOrderConfirmation(data);
  await sendEmail({
    to: data.customerEmail,
    subject: `Order ${data.orderNumber} confirmed – Eat Milay`,
    html,
    text,
  });
}
