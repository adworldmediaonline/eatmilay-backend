import { baseLayout } from "./base-layout.js";

export type AbandonedCartEmailData = {
  customerEmail: string;
  customerName?: string | null;
  items: Array<{
    productName: string;
    productSlug: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  subtotal: number;
  discountAmount?: number;
  currency: string;
  storeUrl: string;
};

function formatCurrency(amount: number, currency: string): string {
  if (currency === "INR") {
    return `₹${amount.toLocaleString("en-IN")}`;
  }
  return `${currency} ${amount.toFixed(2)}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function renderAbandonedCart(data: AbandonedCartEmailData): { html: string; text: string } {
  const cartUrl = `${data.storeUrl}/cart`;
  const itemsRows = data.items
    .map(
      (item) => {
        const productUrl = `${data.storeUrl}/products/${encodeURIComponent(item.productSlug)}`;
        return `
    <tr>
      <td><a href="${escapeHtml(productUrl)}" style="color: #2563eb;">${escapeHtml(item.productName)}</a></td>
      <td>${item.quantity}</td>
      <td class="text-right">${formatCurrency(item.lineTotal, data.currency)}</td>
    </tr>`;
      }
    )
    .join("");

  const total = Math.max(0, data.subtotal - (data.discountAmount ?? 0));

  const body = `
    <h2>You left something behind!</h2>
    <p>Hi ${escapeHtml(data.customerName ?? "there")},</p>
    <p>Your cart is waiting. Complete your order before items sell out.</p>

    <h3>Your cart</h3>
    <table>
      <thead>
        <tr>
          <th>Product</th>
          <th>Qty</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>${itemsRows}</tbody>
    </table>

    <table style="margin-top: 16px;">
      <tr><td>Subtotal</td><td class="text-right">${formatCurrency(data.subtotal, data.currency)}</td></tr>
      ${(data.discountAmount ?? 0) > 0 ? `<tr><td>Discount</td><td class="text-right">-${formatCurrency(data.discountAmount!, data.currency)}</td></tr>` : ""}
      <tr><td><strong>Total</strong></td><td class="text-right"><strong>${formatCurrency(total, data.currency)}</strong></td></tr>
    </table>

    <p style="margin-top: 24px;">
      <a href="${escapeHtml(cartUrl)}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">Complete your order</a>
    </p>
  `;

  const html = baseLayout({ title: "Your cart is waiting", body });

  const text = [
    `You left something behind!`,
    ``,
    `Hi ${data.customerName ?? "there"},`,
    `Your cart is waiting. Complete your order before items sell out.`,
    ``,
    `Your cart:`,
    ...data.items.map(
      (i) => `  - ${i.productName} x ${i.quantity} = ${formatCurrency(i.lineTotal, data.currency)}`
    ),
    ``,
    `Subtotal: ${formatCurrency(data.subtotal, data.currency)}`,
    ...((data.discountAmount ?? 0) > 0 ? [`Discount: -${formatCurrency(data.discountAmount!, data.currency)}`] : []),
    `Total: ${formatCurrency(total, data.currency)}`,
    ``,
    `Complete your order: ${cartUrl}`,
  ].join("\n");

  return { html, text };
}
