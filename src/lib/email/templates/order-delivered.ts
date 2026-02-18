import type { OrderEmailData } from "../types.js";
import { baseLayout } from "./base-layout.js";

function formatCurrency(amount: number, currency: string): string {
  if (currency === "INR") {
    return `₹${amount.toLocaleString("en-IN")}`;
  }
  return `${currency} ${amount.toFixed(2)}`;
}

export function renderOrderDelivered(data: OrderEmailData): { html: string; text: string } {
  const body = `
    <h2>Your order has been delivered</h2>
    <p>Hi ${escapeHtml(data.customerName ?? "Customer")},</p>
    <p>Your order <strong>${escapeHtml(data.orderNumber)}</strong> has been delivered. We hope you enjoy your purchase!</p>
    <p>Total: ${formatCurrency(data.total, data.currency)}</p>
  `;

  const html = baseLayout({ title: `Order ${data.orderNumber} delivered`, body });

  const text = [
    `Your order ${data.orderNumber} has been delivered.`,
    `We hope you enjoy your purchase!`,
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
