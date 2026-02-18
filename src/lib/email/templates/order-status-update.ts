import type { OrderEmailData } from "../types.js";
import { baseLayout } from "./base-layout.js";

export type OrderStatusUpdateData = OrderEmailData & {
  status: string;
  message?: string;
};

export function renderOrderStatusUpdate(data: OrderStatusUpdateData): { html: string; text: string } {
  const message = data.message ?? `Your order status has been updated to: ${data.status}`;

  const body = `
    <h2>Order status update</h2>
    <p>Hi ${escapeHtml(data.customerName ?? "Customer")},</p>
    <p>Your order <strong>${escapeHtml(data.orderNumber)}</strong> has been updated.</p>
    <p><strong>Status:</strong> ${escapeHtml(data.status)}</p>
    <p>${escapeHtml(message)}</p>
  `;

  const html = baseLayout({ title: `Order ${data.orderNumber} – ${data.status}`, body });

  const text = [
    `Order ${data.orderNumber} status update: ${data.status}`,
    ``,
    message,
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
