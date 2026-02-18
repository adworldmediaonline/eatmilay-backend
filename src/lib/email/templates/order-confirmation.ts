import type { OrderEmailData } from "../types.js";
import { baseLayout } from "./base-layout.js";

function formatCurrency(amount: number, currency: string): string {
  if (currency === "INR") {
    return `₹${amount.toLocaleString("en-IN")}`;
  }
  return `${currency} ${amount.toFixed(2)}`;
}

function formatAddress(addr: OrderEmailData["shippingAddress"]): string {
  const parts = [
    addr.fullName,
    addr.addressLine1,
    addr.addressLine2,
    `${addr.city}, ${addr.state} ${addr.postalCode}`,
    addr.country,
    addr.phone,
  ].filter(Boolean);
  return parts.join("\n");
}

export function renderOrderConfirmation(data: OrderEmailData): { html: string; text: string } {
  const dateStr = data.createdAt
    ? new Date(data.createdAt).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "—";

  const itemsRows = data.items
    .map(
      (item) => `
    <tr>
      <td>${escapeHtml(item.productName)}</td>
      <td>${item.quantity}</td>
      <td class="text-right">${formatCurrency(item.unitPrice, data.currency)}</td>
      <td class="text-right">${formatCurrency(item.lineTotal, data.currency)}</td>
    </tr>`
    )
    .join("");

  const paymentLabel = data.paymentMethod === "cod" ? "Cash on Delivery" : "Online Payment (Razorpay)";

  const body = `
    <h2>Thank you for your order</h2>
    <p>Hi ${escapeHtml(data.customerName ?? "Customer")},</p>
    <p>Your order <strong>${escapeHtml(data.orderNumber)}</strong> has been confirmed.</p>
    <p class="text-muted">Order date: ${dateStr}</p>

    <h3>Order details</h3>
    <table>
      <thead>
        <tr>
          <th>Product</th>
          <th>Qty</th>
          <th>Price</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>${itemsRows}</tbody>
    </table>

    <table style="margin-top: 16px;">
      <tr><td>Subtotal</td><td class="text-right">${formatCurrency(data.subtotal, data.currency)}</td></tr>
      ${data.discountAmount > 0 ? `<tr><td>Discount</td><td class="text-right">-${formatCurrency(data.discountAmount, data.currency)}</td></tr>` : ""}
      ${data.shippingAmount > 0 ? `<tr><td>Shipping</td><td class="text-right">${formatCurrency(data.shippingAmount, data.currency)}</td></tr>` : ""}
      <tr><td><strong>Total</strong></td><td class="text-right"><strong>${formatCurrency(data.total, data.currency)}</strong></td></tr>
    </table>

    <h3>Shipping address</h3>
    <pre style="background: #f9fafb; padding: 12px; border-radius: 4px; white-space: pre-wrap; font-family: inherit;">${escapeHtml(formatAddress(data.shippingAddress))}</pre>

    <p><strong>Payment method:</strong> ${escapeHtml(paymentLabel)}</p>
    ${data.estimatedDelivery ? `<p><strong>Estimated delivery:</strong> ${escapeHtml(data.estimatedDelivery)}</p>` : ""}
  `;

  const html = baseLayout({ title: `Order ${data.orderNumber} confirmed`, body });

  const text = [
    `Thank you for your order!`,
    ``,
    `Order: ${data.orderNumber}`,
    `Date: ${dateStr}`,
    ``,
    `Items:`,
    ...data.items.map(
      (i) => `  - ${i.productName} x ${i.quantity} = ${formatCurrency(i.lineTotal, data.currency)}`
    ),
    ``,
    `Subtotal: ${formatCurrency(data.subtotal, data.currency)}`,
    ...(data.discountAmount > 0 ? [`Discount: -${formatCurrency(data.discountAmount, data.currency)}`] : []),
    ...(data.shippingAmount > 0 ? [`Shipping: ${formatCurrency(data.shippingAmount, data.currency)}`] : []),
    `Total: ${formatCurrency(data.total, data.currency)}`,
    ``,
    `Shipping to:`,
    formatAddress(data.shippingAddress),
    ``,
    `Payment: ${paymentLabel}`,
    ...(data.estimatedDelivery ? [`Estimated delivery: ${data.estimatedDelivery}`] : []),
  ].join("\n");

  return { html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
