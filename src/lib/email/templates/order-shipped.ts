import type { OrderEmailData } from "../types.js";
import { baseLayout } from "./base-layout.js";

function formatCurrency(amount: number, currency: string): string {
  if (currency === "INR") {
    return `₹${amount.toLocaleString("en-IN")}`;
  }
  return `${currency} ${amount.toFixed(2)}`;
}

export function renderOrderShipped(data: OrderEmailData): { html: string; text: string } {
  const trackingSection =
    data.trackingNumber || data.trackingUrl
      ? `
    <p><strong>Tracking:</strong> ${data.trackingNumber ?? "—"}</p>
    ${data.trackingUrl ? `<p><a href="${data.trackingUrl}">Track your package</a></p>` : ""}
  `
      : "";

  const body = `
    <h2>Your order has shipped</h2>
    <p>Hi ${escapeHtml(data.customerName ?? "Customer")},</p>
    <p>Good news! Your order <strong>${escapeHtml(data.orderNumber)}</strong> has been shipped.</p>
    ${trackingSection}
    <p>Total: ${formatCurrency(data.total, data.currency)}</p>
  `;

  const html = baseLayout({ title: `Order ${data.orderNumber} shipped`, body });

  const text = [
    `Your order ${data.orderNumber} has shipped!`,
    ``,
    ...(data.trackingNumber ? [`Tracking: ${data.trackingNumber}`] : []),
    ...(data.trackingUrl ? [`Track: ${data.trackingUrl}`] : []),
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
